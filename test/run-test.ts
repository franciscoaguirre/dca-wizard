#!/usr/bin/env npx tsx
/**
 * DCA Wizard Test Runner
 * Executes the single batched proposal against forked Polkadot mainnet using Chopsticks
 *
 * Usage:
 *   npx tsx test/run-test.ts                    # Run connectivity test
 *   npx tsx test/run-test.ts --call "0x..."     # Run with specific batch call
 *
 * Prerequisites:
 *   Start Chopsticks instances in separate terminals:
 *   - chopsticks --config asset-hub.yml --port 8000
 *   - chopsticks --config hydration.yml --port 8001
 *   - chopsticks --config polkadot.yml --port 8002
 *   - chopsticks --config collectives.yml --port 8003
 */

import {
  setupChopsticksNetwork,
  getCurrentBlocks,
  advanceAllBlocks,
  advanceCollectivesBlocks,
  fundAliceAccount,
  fundTreasuryAccount,
  type ChopsticksClients,
} from "./setup";
import {
  executeCollectivesBatchCall,
} from "./governance";
import {
  waitForDcaScheduleId,
  monitorDcaExecution,
  printHydrationBalances,
  printTestSummary,
  monitorSchedulerEvents,
  monitorCollectivesSchedulerEvents,
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
  --call <hex>    Hex-encoded batch call to execute (with or without 0x prefix)
  --help, -h      Show this help message

Prerequisites:
  Start Chopsticks instances before running tests (from project root):

  Terminal 1: npx @acala-network/chopsticks@latest --config test/chopsticks/asset-hub.yml
  Terminal 2: npx @acala-network/chopsticks@latest --config test/chopsticks/hydration.yml
  Terminal 3: npx @acala-network/chopsticks@latest --config test/chopsticks/polkadot.yml
  Terminal 4: npx @acala-network/chopsticks@latest --config test/chopsticks/collectives.yml

Examples:
  # Run with a batch call from the DCA wizard
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
  console.log("   Single Batched Proposal on Collectives");
  console.log("=".repeat(60));

  let clients: ChopsticksClients | undefined;
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
      console.log("To test a DCA wizard batch call, use:");
      console.log('  npx tsx test/run-test.ts --call "0x..."');
      console.log("\nConnectivity test successful!");
      await clients.cleanup();
      process.exit(0);
    }

    // Step 3: Process the batch call
    console.log("\n[Step 3] Processing batch call...\n");
    const normalizedCallHex = callHex.startsWith("0x")
      ? callHex
      : `0x${callHex}`;

    console.log(`Call hex: ${normalizedCallHex.slice(0, 66)}...`);

    // Step 4: Inject batch call into Collectives scheduler with Architects origin
    console.log("\n[Step 4] Injecting batch call into Collectives scheduler...\n");
    await executeCollectivesBatchCall(
      clients,
      normalizedCallHex
    );

    // Step 5: Advance Collectives blocks to trigger batch execution
    console.log("\n[Step 5] Advancing Collectives blocks to trigger batch...\n");
    const collectivesEvents = await monitorCollectivesSchedulerEvents(clients, 2);
    console.log(`Found ${collectivesEvents.length} Scheduler.Dispatched events on Collectives`);

    // Step 6: Advance all chain blocks to propagate XCM messages
    console.log("\n[Step 6] Advancing all chains to propagate XCMs...\n");
    await advanceAllBlocks(clients, 5);

    // Monitor scheduler events on Asset Hub (for XCM arrival)
    console.log("\nMonitoring Asset Hub events...");
    const schedulerEvents = await monitorSchedulerEvents(clients, 5);
    console.log(`Found ${schedulerEvents.length} scheduler events on Asset Hub`);

    // Step 7: Wait for warm-up period and trigger DCA start
    console.log("\n[Step 7] Waiting for warm-up period...\n");
    // The DCA start is scheduled after WARM_UP_BLOCKS on Collectives
    // Advance Collectives blocks to trigger the scheduled DCA send
    await advanceCollectivesBlocks(clients, 100);
    // Then advance all chains to propagate the DCA XCM to Hydration
    await advanceAllBlocks(clients, 5);

    // Step 8: Check Hydration balances
    console.log("\n[Step 8] Checking Hydration balances...\n");

    // The Plurality sovereign account on Hydration receives the DOT
    // We can check using the treasury sovereign address
    const treasurySovAccount = ACCOUNTS.FELLOWSHIP_TREASURY;
    await printHydrationBalances(clients, treasurySovAccount, "Fellowship Treasury Sovereign");

    // Step 9: Monitor for DCA events
    console.log("\n[Step 9] Monitoring for DCA events...\n");

    try {
      const dcaId = await waitForDcaScheduleId(
        clients,
        treasurySovAccount,
        20
      );

      console.log(`\nDCA Schedule created with ID: ${dcaId}`);

      // Monitor DCA execution
      console.log("\nMonitoring DCA trades...");
      const dcaResult = await monitorDcaExecution(clients, [dcaId], 50);
      printTestSummary(dcaResult);
    } catch (error) {
      console.log("No DCA events detected (this may be expected if warmup hasn't completed)");
      console.log(`Error: ${error}`);
    }

    // Step 10: Advance blocks to trigger periodic return
    console.log("\n[Step 10] Advancing blocks for periodic return...\n");
    // Advance Collectives blocks for the periodic return scheduler
    await advanceCollectivesBlocks(clients, 200);
    await advanceAllBlocks(clients, 10);

    // Final balance check
    console.log("\n[Final] Balance Summary\n");
    await printHydrationBalances(clients, treasurySovAccount, "Fellowship Treasury Sovereign");
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
