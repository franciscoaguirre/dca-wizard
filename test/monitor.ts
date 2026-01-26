/**
 * Event monitoring utilities for DCA Wizard testing
 * Tracks DCA execution, XCM events, and scheduler events
 */

import type { SS58String } from "polkadot-api";
import type { ChopsticksClients } from "./setup";
import { advanceAllBlocks, advanceHydrationBlocks } from "./setup";
import { HYDRATION_ASSETS, DECIMALS } from "./constants";

// Track active DCAs for monitoring
interface DcaInfo {
  id: number;
  asset: "USDT" | "USDC" | "DOT";
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

  const usdtBalance = await checkHydrationBalance(
    clients,
    account,
    HYDRATION_ASSETS.polkadot.USDT
  );
  console.log(
    `  USDT: ${Number(usdtBalance) / 10 ** DECIMALS.USDT} USDT (${usdtBalance} units)`
  );

  const usdcBalance = await checkHydrationBalance(
    clients,
    account,
    HYDRATION_ASSETS.polkadot.USDC
  );
  console.log(
    `  USDC: ${Number(usdcBalance) / 10 ** DECIMALS.USDC} USDC (${usdcBalance} units)`
  );

  return { dotBalance, usdtBalance, usdcBalance };
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
      console.log(`[Block ${currentBlock}] Scheduler.Dispatched event`);
    }

    await clients.ahClient._request("dev_newBlock", [{ count: 1 }]);
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
