/**
 * Event monitoring utilities for DCA Wizard testing
 * Tracks DCA execution, XCM events, and scheduler events
 */

import type { SS58String } from "polkadot-api";
import type { ChopsticksClients } from "./setup";
import { advanceAllBlocks, advanceCollectivesBlocks, advanceHydrationBlocks } from "./setup";
import { HYDRATION_ASSETS, DECIMALS, ACCOUNTS, ALICE } from "./constants";

// Track active DCAs for monitoring
interface DcaInfo {
  id: number;
  asset: "HOLLAR" | "DOT";
}

const activeDcas: DcaInfo[] = [];

export function addDcaToMonitor(id: number, asset: DcaInfo["asset"]) {
  activeDcas.push({ id, asset });
  console.log(`Added DCA ${id} (${asset}) to monitoring`);
}

export function clearMonitoredDcas() {
  activeDcas.length = 0;
}

/**
 * Monitor for DCA.ExecutionPlanned events and return the DCA schedule ID
 */
export async function waitForDcaScheduleId(
  clients: ChopsticksClients,
  owner: SS58String,
  maxBlocks: number = 50
): Promise<number> {
  for (let i = 0; i < maxBlocks; i++) {
    const events = await clients.hydrationApi.event.DCA.ExecutionPlanned.pull();
    const matchingEvent = events.find((event) => event.payload.who === owner);

    if (matchingEvent) {
      console.log(`Found DCA schedule ID: ${matchingEvent.payload.id}`);
      return matchingEvent.payload.id;
    }

    console.log(`No DCA event found yet, advancing block ${i + 1}/${maxBlocks}...`);
    await advanceAllBlocks(clients, 1);
  }

  throw new Error(`DCA ExecutionPlanned event not found after ${maxBlocks} blocks`);
}

/**
 * Check DCA remaining amounts
 */
export async function checkDcaProgress(
  clients: ChopsticksClients,
  dcaId: number
): Promise<bigint | undefined> {
  try {
    const remaining =
      await clients.hydrationApi.query.DCA.RemainingAmounts.getValue(dcaId);
    return remaining;
  } catch (error) {
    console.log(`Error checking DCA ${dcaId} progress:`, error);
    return undefined;
  }
}

/**
 * Print a full balance snapshot across all chains for all relevant accounts
 */
export async function printBalanceSnapshot(
  clients: ChopsticksClients,
  label: string = "Balance Snapshot"
) {
  const accounts = [
    { address: ACCOUNTS.FELLOWSHIP_TREASURY, name: "Fellowship Treasury" },
    { address: ACCOUNTS.FELLOWSHIP_SALARY, name: "Fellowship Salary" },
    { address: ALICE, name: "Alice" },
  ];

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(60)}`);

  for (const { address, name } of accounts) {
    console.log(`\n  ${name} (${address.slice(0, 8)}…${address.slice(-6)})`);

    // Asset Hub - native DOT
    try {
      const ahAccount = await clients.ahApi.query.System.Account.getValue(address);
      const dotFree = ahAccount.data.free;
      const dotReserved = ahAccount.data.reserved;
      console.log(`    Asset Hub   DOT: ${fmtBalance(dotFree, DECIMALS.DOT)} (reserved: ${fmtBalance(dotReserved, DECIMALS.DOT)})`);
    } catch {
      console.log(`    Asset Hub   DOT: 0`);
    }

    // Collectives - native balance
    try {
      const colAccount = await clients.collectivesApi.query.System.Account.getValue(address);
      const colFree = colAccount.data.free;
      console.log(`    Collectives DOT: ${fmtBalance(colFree, DECIMALS.DOT)}`);
    } catch {
      console.log(`    Collectives DOT: 0`);
    }

    // Hydration - DOT, HOLLAR
    const hydAssets = [
      { id: HYDRATION_ASSETS.polkadot.DOT, name: "DOT", decimals: DECIMALS.DOT },
      { id: HYDRATION_ASSETS.polkadot.HOLLAR, name: "HOLLAR", decimals: DECIMALS.HOLLAR },
    ];
    for (const asset of hydAssets) {
      try {
        const bal = await clients.hydrationApi.apis.CurrenciesApi.free_balance(asset.id, address);
        console.log(`    Hydration   ${asset.name.padEnd(4)}: ${fmtBalance(bal, asset.decimals)}`);
      } catch {
        console.log(`    Hydration   ${asset.name.padEnd(4)}: 0`);
      }
    }
  }

  console.log(`\n${"─".repeat(60)}\n`);
}

function fmtBalance(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = (amount % divisor).toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${whole.toLocaleString()}.${frac}`;
}

/**
 * Check balance on Hydration for a specific account and asset
 */
export async function checkHydrationBalance(
  clients: ChopsticksClients,
  account: SS58String,
  assetId: number
): Promise<bigint> {
  try {
    const balance = await clients.hydrationApi.apis.CurrenciesApi.free_balance(
      assetId,
      account
    );
    return balance;
  } catch (error) {
    console.log(`Error checking balance for asset ${assetId}:`, error);
    return 0n;
  }
}

/**
 * Print all account balances on Hydration
 */
export async function printHydrationBalances(
  clients: ChopsticksClients,
  account: SS58String,
  label: string = "Account"
) {
  console.log(`\n=== ${label} Balances on Hydration ===`);

  const dotBalance = await checkHydrationBalance(
    clients,
    account,
    HYDRATION_ASSETS.polkadot.DOT
  );
  console.log(
    `  DOT: ${Number(dotBalance) / 10 ** DECIMALS.DOT} DOT (${dotBalance} units)`
  );

  const hollarBalance = await checkHydrationBalance(
    clients,
    account,
    HYDRATION_ASSETS.polkadot.HOLLAR
  );
  // HOLLAR has 18 decimals; bigint divide to avoid float precision loss.
  const hollarWhole = hollarBalance / 10n ** BigInt(DECIMALS.HOLLAR);
  console.log(
    `  HOLLAR: ~${hollarWhole.toLocaleString()} HOLLAR (${hollarBalance} units)`
  );

  return { dotBalance, hollarBalance };
}

/**
 * Monitor DCA execution events
 */
export interface DcaMonitorResult {
  tradesExecuted: number;
  tradesFailed: number;
  completed: boolean;
  events: Array<{
    type: "executed" | "failed" | "completed";
    dcaId: number;
    block: number;
    payload: unknown;
  }>;
}

export async function monitorDcaExecution(
  clients: ChopsticksClients,
  dcaIds: number[],
  maxBlocks: number = 100,
  onProgress?: (result: DcaMonitorResult) => void
): Promise<DcaMonitorResult> {
  console.log(`\nStarting DCA monitoring for IDs: ${dcaIds.join(", ")}`);

  const result: DcaMonitorResult = {
    tradesExecuted: 0,
    tradesFailed: 0,
    completed: false,
    events: [],
  };

  const completedDcas = new Set<number>();

  for (let i = 0; i < maxBlocks; i++) {
    const currentBlock = await clients.hydrationApi.query.System.Number.getValue();

    // Check for TradeExecuted events
    const executedEvents = (
      await clients.hydrationApi.event.DCA.TradeExecuted.pull()
    ).filter((event) => dcaIds.includes(event.payload.id));

    // Check for TradeFailed events
    const failedEvents = (
      await clients.hydrationApi.event.DCA.TradeFailed.pull()
    ).filter((event) => dcaIds.includes(event.payload.id));

    // Check for Completed events
    const completedEvents = (
      await clients.hydrationApi.event.DCA.Completed.pull()
    ).filter((event) => dcaIds.includes(event.payload.id));

    // Process executed trades
    for (const event of executedEvents) {
      result.tradesExecuted++;
      result.events.push({
        type: "executed",
        dcaId: event.payload.id,
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(`[Block ${currentBlock}] Trade executed for DCA ${event.payload.id}`);
    }

    // Process failed trades
    for (const event of failedEvents) {
      result.tradesFailed++;
      result.events.push({
        type: "failed",
        dcaId: event.payload.id,
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(`[Block ${currentBlock}] Trade FAILED for DCA ${event.payload.id}`);
    }

    // Process completed DCAs
    for (const event of completedEvents) {
      completedDcas.add(event.payload.id);
      result.events.push({
        type: "completed",
        dcaId: event.payload.id,
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(`[Block ${currentBlock}] DCA ${event.payload.id} COMPLETED`);
    }

    // Check if all DCAs are complete
    if (completedDcas.size >= dcaIds.length) {
      result.completed = true;
      console.log("\nAll DCAs completed!");
      break;
    }

    // Callback for progress updates
    if (onProgress) {
      onProgress(result);
    }

    // Advance to next block
    await advanceHydrationBlocks(clients, 1);
  }

  return result;
}

/**
 * Monitor Scheduler.Dispatched events on Asset Hub
 */
export async function monitorSchedulerEvents(
  clients: ChopsticksClients,
  maxBlocks: number = 10
): Promise<Array<{ block: number; payload: unknown }>> {
  const events: Array<{ block: number; payload: unknown }> = [];

  for (let i = 0; i < maxBlocks; i++) {
    const currentBlock = await clients.ahApi.query.System.Number.getValue();
    const dispatchedEvents = await clients.ahApi.event.Scheduler.Dispatched.pull();

    for (const event of dispatchedEvents) {
      events.push({
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(
        `[Block ${currentBlock}] Scheduler.Dispatched: result=${JSON.stringify(
          event.payload.result,
          (_, v) => (typeof v === "bigint" ? v.toString() : v)
        )}`
      );
    }

    await clients.ahClient._request("dev_newBlock", [{ count: 1 }]);
  }

  return events;
}

/**
 * Advance Collectives blocks one at a time, monitoring for Scheduler events.
 * The Collectives scheduler uses parachain block numbers (BlockNumberProvider = System).
 */
export async function monitorCollectivesSchedulerEvents(
  clients: ChopsticksClients,
  count: number
): Promise<Array<{ block: number; payload: unknown }>> {
  const events: Array<{ block: number; payload: unknown }> = [];

  for (let i = 0; i < count; i++) {
    await advanceCollectivesBlocks(clients, 1);
    const currentBlock = await clients.collectivesApi.query.System.Number.getValue();
    console.log(`  Advanced to Collectives block ${currentBlock}`);

    // Check agenda for next block to see if entry is still pending
    const nextAgenda = await clients.collectivesApi.query.Scheduler.Agenda.getValue(Number(currentBlock) + 1);
    if (nextAgenda.length > 0) {
      console.log(`  Agenda at block ${Number(currentBlock) + 1}: ${nextAgenda.length} pending entries`);
    }

    // Read system events directly as a fallback
    const systemEvents = await clients.collectivesApi.query.System.Events.getValue();
    const schedulerEvents = systemEvents.filter(
      (e: { event: { type: string } }) => e.event.type === "Scheduler"
    );
    if (schedulerEvents.length > 0) {
      for (const se of schedulerEvents) {
        console.log(`  [Collectives block ${currentBlock}] System.Events Scheduler: ${JSON.stringify(se.event, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
      }
    }

    const dispatchedEvents = await clients.collectivesApi.event.Scheduler.Dispatched.pull();
    for (const event of dispatchedEvents) {
      events.push({
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(`  [Collectives block ${currentBlock}] Scheduler.Dispatched (pull): result=${JSON.stringify(event.payload.result)}`);
    }

    // Also check for XCM sent events
    try {
      const sentEvents = await clients.collectivesApi.event.PolkadotXcm.Sent.pull();
      for (const _event of sentEvents) {
        console.log(`  [Collectives block ${currentBlock}] PolkadotXcm.Sent`);
      }
    } catch {
      // Event may not exist
    }
  }

  return events;
}

/**
 * Advance Collectives blocks while logging inbound XCM processing
 * (MessageQueue.Processed), outbound sends (PolkadotXcm.Sent), and scheduler
 * activity (Scheduler.Scheduled). Used by the treasury path, whose Superuser
 * Transacts arrive from Asset Hub and re-enter the fellowship flow here.
 */
export async function monitorCollectivesXcmEvents(
  clients: ChopsticksClients,
  count: number
): Promise<Array<{ type: string; block: number; payload: unknown }>> {
  const events: Array<{ type: string; block: number; payload: unknown }> = [];

  for (let i = 0; i < count; i++) {
    await advanceCollectivesBlocks(clients, 1);
    const currentBlock = await clients.collectivesApi.query.System.Number.getValue();

    try {
      const processedEvents =
        await clients.collectivesApi.event.MessageQueue.Processed.pull();
      for (const event of processedEvents) {
        events.push({
          type: "MessageQueue.Processed",
          block: Number(currentBlock),
          payload: event.payload,
        });
        console.log(
          `  [Collectives block ${currentBlock}] MessageQueue.Processed: success=${event.payload.success}`
        );
      }
    } catch {
      // Event may not exist
    }

    try {
      const sentEvents = await clients.collectivesApi.event.PolkadotXcm.Sent.pull();
      for (const event of sentEvents) {
        events.push({
          type: "PolkadotXcm.Sent",
          block: Number(currentBlock),
          payload: event.payload,
        });
        console.log(`  [Collectives block ${currentBlock}] PolkadotXcm.Sent`);
      }
    } catch {
      // Event may not exist
    }

    const scheduledEvents =
      await clients.collectivesApi.event.Scheduler.Scheduled.pull();
    for (const event of scheduledEvents) {
      events.push({
        type: "Scheduler.Scheduled",
        block: Number(currentBlock),
        payload: event.payload,
      });
      console.log(
        `  [Collectives block ${currentBlock}] Scheduler.Scheduled (periodic return)`
      );
    }
  }

  return events;
}

/**
 * Monitor XCM events on Asset Hub
 */
export async function monitorXcmEvents(
  clients: ChopsticksClients,
  maxBlocks: number = 10
) {
  console.log("\nMonitoring XCM events on Asset Hub...");

  const events: Array<{ type: string; block: number; payload: unknown }> = [];

  for (let i = 0; i < maxBlocks; i++) {
    const currentBlock = await clients.ahApi.query.System.Number.getValue();

    // Check PolkadotXcm.Sent events
    try {
      const sentEvents = await clients.ahApi.event.PolkadotXcm.Sent.pull();
      for (const event of sentEvents) {
        events.push({
          type: "PolkadotXcm.Sent",
          block: Number(currentBlock),
          payload: event.payload,
        });
        console.log(`[Block ${currentBlock}] PolkadotXcm.Sent event`);
      }
    } catch {
      // Event may not exist on this chain
    }

    // Check MessageQueue.Processed events
    try {
      const processedEvents =
        await clients.ahApi.event.MessageQueue.Processed.pull();
      for (const event of processedEvents) {
        events.push({
          type: "MessageQueue.Processed",
          block: Number(currentBlock),
          payload: event.payload,
        });
        console.log(`[Block ${currentBlock}] MessageQueue.Processed event`);
      }
    } catch {
      // Event may not exist on this chain
    }

    await clients.ahClient._request("dev_newBlock", [{ count: 1 }]);
  }

  return events;
}

/**
 * Print test summary
 */
export function printTestSummary(result: DcaMonitorResult) {
  console.log("\n========================================");
  console.log("           TEST SUMMARY");
  console.log("========================================");
  console.log(`Trades Executed: ${result.tradesExecuted}`);
  console.log(`Trades Failed:   ${result.tradesFailed}`);
  console.log(`Completed:       ${result.completed ? "Yes" : "No"}`);
  console.log(`Total Events:    ${result.events.length}`);
  console.log("========================================\n");
}
