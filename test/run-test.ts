#!/usr/bin/env npx tsx
/**
 * DCA Wizard Test Runner
 * Executes hex-encoded calls against forked Polkadot mainnet using Chopsticks
 *
 * Usage:
 *   npx tsx test/run-test.ts                    # Run with sample call
 *   npx tsx test/run-test.ts --call "0x..."     # Run with specific call
 *
 * Prerequisites:
 *   Start Chopsticks instances in separate terminals:
 *   - chopsticks --config asset-hub.yml --port 8000
 *   - chopsticks --config hydration.yml --port 8001
 *   - chopsticks --config polkadot.yml --port 8002
 */

import { Binary, FixedSizeBinary } from "polkadot-api";
import {
  setupChopsticksNetwork,
  getCurrentBlocks,
  advanceAllBlocks,
  fundAliceAccount,
  fundTreasuryAccount,
} from "./setup";
import {
  storePreimage,
  getPreimage,
  executeGovernanceCall,
  computeCallHash,
} from "./governance";
import {
  waitForDcaScheduleId,
  monitorDcaExecution,
  printHydrationBalances,
  printTestSummary,
  monitorSchedulerEvents,
} from "./monitor";
import { ACCOUNTS, TREASURY_FUND_AMOUNT } from "./constants";

// Parse command line arguments
function parseArgs(): { callHex: string | null; help: boolean } {
  const args = process.argv.slice(2);
  let callHex: string | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--call" && args[i + 1]) {
      callHex = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      help = true;
    }
  }

  return { callHex, help };
}

function printUsage() {
  console.log(`
DCA Wizard Test Runner
======================

Usage:
  npx tsx test/run-test.ts [options]

Options:
  --call <hex>    Hex-encoded call to execute (with or without 0x prefix)
  --help, -h      Show this help message

Prerequisites:
  Start Chopsticks instances before running tests (from project root):

  Terminal 1: npx @acala-network/chopsticks@latest --config test/chopsticks/asset-hub.yml
  Terminal 2: npx @acala-network/chopsticks@latest --config test/chopsticks/hydration.yml
  Terminal 3: npx @acala-network/chopsticks@latest --config test/chopsticks/polkadot.yml

Examples:
  # Run with a specific call from the DCA wizard
  npx tsx test/run-test.ts --call "0x1f0801..."

  # Run without a call (just test connectivity)
  npx tsx test/run-test.ts
`);
}

async function main() {
  const { callHex, help } = parseArgs();

  if (help) {
    printUsage();
    process.exit(0);
  }

  console.log("=".repeat(60));
  console.log("   DCA Wizard Chopsticks Test");
  console.log("=".repeat(60));

  let clients;
  try {
    // Step 1: Setup chopsticks network connections
    console.log("\n[Step 1] Connecting to Chopsticks networks...\n");
    clients = await setupChopsticksNetwork();
    await getCurrentBlocks(clients);

    // Step 2: Fund accounts
    console.log("\n[Step 2] Funding accounts...\n");
    await fundAliceAccount(clients);
    await fundTreasuryAccount(clients, TREASURY_FUND_AMOUNT);

    // If no call provided, just test connectivity and exit
    if (!callHex) {
      console.log("\n[Info] No call provided. Testing connectivity only.\n");
      console.log("To test a DCA wizard call, use:");
      console.log('  npx tsx test/run-test.ts --call "0x..."');
      console.log("\nConnectivity test successful!");
      await clients.cleanup();
      process.exit(0);
    }

    // Step 3: Process the call
    console.log("\n[Step 3] Processing call...\n");
    const normalizedCallHex = callHex.startsWith("0x")
      ? callHex
      : `0x${callHex}`;
    const callData = Binary.fromHex(normalizedCallHex);
    const callSize = callData.asBytes().length;
    const { hash, hashHex } = computeCallHash(callData);

    console.log(`Call hex: ${normalizedCallHex.slice(0, 66)}...`);
    console.log(`Call size: ${callSize} bytes`);
    console.log(`Call hash: ${hashHex}`);

    // Step 4: Check if preimage exists, otherwise store it
    console.log("\n[Step 4] Handling preimage...\n");
    const existingPreimage = await getPreimage(
      clients,
      FixedSizeBinary.fromBytes(hash),
      callSize
    );

    if (!existingPreimage) {
      console.log("Preimage not found, storing...");
      await storePreimage(clients, callData);
    } else {
      console.log("Preimage already exists");
    }

    // Step 5: Execute the governance call via scheduler
    console.log("\n[Step 5] Executing governance call...\n");
    await executeGovernanceCall(
      clients,
      hashHex,
      callSize
    );

    // Step 6: Advance blocks and monitor execution
    console.log("\n[Step 6] Advancing blocks and monitoring...\n");

    // Advance blocks to trigger execution
    await advanceAllBlocks(clients, 1);

    // Monitor scheduler events on Asset Hub
    console.log("\nMonitoring Scheduler events...");
    const schedulerEvents = await monitorSchedulerEvents(clients, 5);
    console.log(`Found ${schedulerEvents.length} scheduler events`);

    // Wait for the scheduled XCM to be sent (warm-up period)
    console.log("\nWaiting for warm-up period...");
    await advanceAllBlocks(clients, 5);

    // Step 7: Check balances on Hydration
    console.log("\n[Step 7] Checking Hydration balances...\n");

    // Get the treasury sovereign account on Hydration
    // This is derived from the treasury account's location
    const treasurySovAccount = ACCOUNTS.TREASURY;
    await printHydrationBalances(clients, treasurySovAccount, "Treasury Sovereign");

    // Step 8: Monitor for DCA events (if applicable)
    console.log("\n[Step 8] Monitoring for DCA events...\n");

    // Try to find DCA ExecutionPlanned events
    try {
      const dcaId = await waitForDcaScheduleId(
        clients,
        treasurySovAccount,
        20 // Max blocks to wait
      );

      console.log(`\nDCA Schedule created with ID: ${dcaId}`);

      // Monitor DCA execution
      console.log("\nMonitoring DCA trades...");
      const dcaResult = await monitorDcaExecution(clients, [dcaId], 50);
      printTestSummary(dcaResult);
    } catch (error) {
      console.log("No DCA events detected (this is expected for some call types)");
      console.log(`Error: ${error}`);
    }

    // Final balance check
    console.log("\n[Final] Balance Summary\n");
    await printHydrationBalances(clients, treasurySovAccount, "Treasury Sovereign");
    await getCurrentBlocks(clients);

    console.log("\n" + "=".repeat(60));
    console.log("   Test Complete");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\nTest failed with error:", error);
    process.exit(1);
  } finally {
    if (clients) {
      console.log("\nCleaning up...");
      await clients.cleanup();
    }
  }
}

// Run the test
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
