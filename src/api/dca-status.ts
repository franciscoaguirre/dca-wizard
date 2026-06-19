/**
 * Ongoing Fellowship DCA status.
 *
 * Detects whether a DCA the Fellowship already set up is live, from its two
 * on-chain footprints:
 *
 *  1. Hydration — `DCA.schedule`s whose `owner` is the Fellowship Treasury pallet
 *     sovereign account on Hydration (the authoritative DOT→HOLLAR signal).
 *  2. Collectives — periodic "cash-out" return messages parked in `Scheduler.Agenda`:
 *     `PolkadotXcm.send` calls that deposit accumulated HOLLAR back to the Fellowship
 *     Treasury / Salary accounts on Asset Hub.
 */

import { useEffect, useState } from 'react';
import { getSs58AddressInfo } from 'polkadot-api';
import { ACCOUNTS, HYDRATION_ASSETS, type NetworkType } from './constants';
import { getHydrationApi } from './clients/hydration';
import { getCollectivesApi } from './clients/collectives';
import { getFellowshipTreasurySovereignOnHydration } from '../governance/dca-setup';

export interface HydrationSchedule {
  id: number;
  /** DOT sold per trade (planck, 10 decimals). */
  amountPerTrade: bigint;
  /** Blocks between trades. */
  period: number;
  /** Next planned execution block, if tracked. */
  nextExecutionBlock: number | null;
}

export interface HydrationDcaStatus {
  /** FT sovereign account on Hydration that owns the schedules. */
  owner: string;
  schedules: HydrationSchedule[];
  /**
   * Owner's free DOT balance on Hydration (asset_in). The wizard schedules with
   * `total_amount: 0`, so the DCA trades until this balance is exhausted — this
   * is the real "DOT left to convert", not `DCA.RemainingAmounts`.
   */
  dotRemaining: bigint;
  currentBlock: number;
}

export interface CollectivesReturn {
  /** Agenda block the cash-out is scheduled for. */
  block: number;
  /** Blocks between repetitions, if periodic. */
  periodBlocks: number | null;
  /** Remaining repetitions, if periodic. */
  remaining: number | null;
}

export interface CollectivesReturnStatus {
  returns: CollectivesReturn[];
  currentBlock: number;
}

export interface DcaStatusResult {
  hydration: HydrationDcaStatus | null;
  collectives: CollectivesReturnStatus | null;
  loading: boolean;
  error: string | null;
}

const REFRESH_MS = 30_000;

/** Lower-case hex (no `0x`) of an SS58 account's 32-byte public key. */
function publicKeyHex(address: string): string {
  const info = getSs58AddressInfo(address);
  if (!info.isValid) throw new Error(`Failed to decode SS58 address: ${address}`);
  return [...info.publicKey].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TREASURY_KEY_HEX = publicKeyHex(ACCOUNTS.FELLOWSHIP_TREASURY);
const SALARY_KEY_HEX = publicKeyHex(ACCOUNTS.FELLOWSHIP_SALARY);

/**
 * Active DCAs on Hydration owned by the Fellowship Treasury sovereign.
 * Exported (not just via the hook) so the Chopsticks harness can call it directly.
 */
export async function fetchHydrationDcaStatus(
  network: NetworkType,
): Promise<HydrationDcaStatus> {
  const api = await getHydrationApi(network);
  const owner = await getFellowshipTreasurySovereignOnHydration(network);
  const hollarId = HYDRATION_ASSETS[network].HOLLAR;
  const dotId = HYDRATION_ASSETS[network].DOT;

  const [currentBlock, ownership, dotAccount] = await Promise.all([
    api.query.System.Number.getValue(),
    // Partial-key prefix on the owner of the [owner, scheduleId] NMap.
    api.query.DCA.ScheduleOwnership.getEntries(owner),
    // Owner's DOT (asset_in) balance — the real budget the DCA draws down.
    api.query.Tokens.Accounts.getValue(owner, dotId),
  ]);

  const ids = ownership.map(
    (entry: { keyArgs: [string, number] }) => entry.keyArgs[1],
  );

  const schedules: HydrationSchedule[] = [];
  await Promise.all(
    ids.map(async (id: number) => {
      const [schedule, nextBlock] = await Promise.all([
        api.query.DCA.Schedules.getValue(id),
        api.query.DCA.ScheduleExecutionBlock.getValue(id),
      ]);
      if (!schedule) return;
      // Only surface DOT→HOLLAR sells, matching what this wizard creates.
      if (schedule.order.type !== 'Sell' || schedule.order.value.asset_out !== hollarId) {
        return;
      }
      schedules.push({
        id,
        amountPerTrade: schedule.order.value.amount_in,
        period: schedule.period,
        nextExecutionBlock: nextBlock ?? null,
      });
    }),
  );

  schedules.sort((a, b) => a.id - b.id);
  return { owner, schedules, dotRemaining: dotAccount?.free ?? 0n, currentBlock };
}

/**
 * Scheduled cash-out return messages on Collectives that pay the Fellowship
 * Treasury / Salary accounts. Iterates the scheduler agenda, decodes each future
 * task, keeps `PolkadotXcm.send` calls, and matches by the beneficiary account ids
 * embedded in the return XCM. Exported for the Chopsticks harness.
 */
export async function fetchCollectivesReturnStatus(
  network: NetworkType,
): Promise<CollectivesReturnStatus> {
  const c = await getCollectivesApi(network);

  const [currentBlock, agenda] = await Promise.all([
    c.query.System.Number.getValue(),
    c.query.Scheduler.Agenda.getEntries(),
  ]);

  const returns: CollectivesReturn[] = [];

  for (const entry of agenda) {
    const block = entry.keyArgs[0];
    if (block < currentBlock) continue;

    for (const task of entry.value) {
      if (!task) continue;

      // Resolve the SCALE-encoded call bytes (inline or via preimage lookup).
      let bytes;
      if (task.call.type === 'Inline') {
        bytes = task.call.value;
      } else if (task.call.type === 'Lookup') {
        bytes = await c.query.Preimage.PreimageFor.getValue([
          task.call.value.hash,
          task.call.value.len,
        ]);
      }
      if (!bytes) continue;

      // Confirm it is a PolkadotXcm.send, then match the beneficiary accounts.
      try {
        const tx = await c.txFromCallData(bytes);
        const decoded = tx.decodedCall;
        if (decoded.type !== 'PolkadotXcm' || decoded.value.type !== 'send') continue;
      } catch {
        continue; // undecodable call — not ours
      }

      const hex = bytes.asHex().toLowerCase();
      if (!hex.includes(TREASURY_KEY_HEX) && !hex.includes(SALARY_KEY_HEX)) continue;

      const periodic = task.maybe_periodic;
      returns.push({
        block,
        periodBlocks: periodic ? periodic[0] : null,
        remaining: periodic ? periodic[1] : null,
      });
    }
  }

  returns.sort((a, b) => a.block - b.block);
  return { returns, currentBlock };
}

export function useFellowshipDcaStatus(network: NetworkType): DcaStatusResult {
  const [hydration, setHydration] = useState<HydrationDcaStatus | null>(null);
  const [collectives, setCollectives] = useState<CollectivesReturnStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [h, c] = await Promise.all([
          fetchHydrationDcaStatus(network),
          fetchCollectivesReturnStatus(network),
        ]);
        if (cancelled) return;
        setHydration(h);
        setCollectives(c);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load DCA status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [network]);

  return { hydration, collectives, loading, error };
}
