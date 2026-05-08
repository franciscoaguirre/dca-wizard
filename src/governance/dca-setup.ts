/**
 * DCA Setup Logic
 * Builds the DCA.schedule call that will be executed on Hydration.
 * Target asset is HOLLAR (id 222 on Hydration, 18 decimals). Per Hydration core,
 * the same Router call shape works with an empty route — no explicit hop list needed.
 */

import type { NetworkType } from '../api/constants';
import {
  getHydrationAssetId,
  DCA_CONFIG,
  TIMING,
} from '../api/constants';
import { Enum } from 'polkadot-api';
import { XcmVersionedLocation } from '@polkadot-api/descriptors';
import { getHydrationApi } from '../api/clients/hydration';
import { fellowshipTreasuryPalletLocationV5 } from './xcm-messages';

/**
 * DCA Order Type (Sell: exact amount in, minimum out)
 */
export interface DcaOrder {
  asset_in: number; // Asset ID to sell (DOT on Hydration)
  asset_out: number; // Asset ID to buy (HOLLAR on Hydration)
  amount_in: bigint; // Amount per trade
  min_amount_out: bigint; // Minimum expected output (after slippage)
}

/**
 * DCA Schedule Parameters passed to DCA.schedule on Hydration.
 */
export interface DcaScheduleParams {
  owner: string; // Sovereign account SS58 (Collectives Plurality on Hydration)
  period: number; // Blocks between trades
  total_amount: bigint; // 0 = continuous until depleted
  max_retries: number;
  stability_threshold: number; // Price stability threshold (per million)
  slippage: number; // Max slippage (per million)
  order: DcaOrder;
}

/**
 * Calculate DCA parameters from user inputs
 */
export function calculateDcaParams(
  network: NetworkType,
  sovereignAccount: string,
  dcaFrequencyBlocks: number,
  slippagePercent: number,
  dotPerTrade: bigint,
  expectedOutputPerTrade: bigint
): DcaScheduleParams {
  const dotAssetId = getHydrationAssetId(network, 'DOT');
  const hollarAssetId = getHydrationAssetId(network, 'HOLLAR');

  // Convert percentage to per million (1% = 10,000 per million)
  const slippagePerMillion = Math.floor(slippagePercent * 10_000);
  const stabilityPerMillion = DCA_CONFIG.STABILITY_THRESHOLD_PERCENT * 10_000;

  // `min_amount_out` is the absolute per-trade floor. The per-trade AMM slippage
  // is enforced separately via the `slippage` field below, so this floor only
  // needs to tolerate price drift over the schedule's lifetime. Apply a fixed
  // PRICE_DECLINE_BUFFER_PERCENT discount against the proposal-time price.
  const minAmountOut =
    (expectedOutputPerTrade *
      BigInt(100 - DCA_CONFIG.PRICE_DECLINE_BUFFER_PERCENT)) /
    100n;

  return {
    owner: sovereignAccount,
    period: dcaFrequencyBlocks,
    total_amount: 0n, // 0 means use all available balance
    max_retries: DCA_CONFIG.MAX_RETRIES,
    stability_threshold: stabilityPerMillion,
    slippage: slippagePerMillion,
    order: {
      asset_in: dotAssetId,
      asset_out: hollarAssetId,
      amount_in: dotPerTrade,
      min_amount_out: minAmountOut,
    },
  };
}

/**
 * Encode DCA.schedule call via Hydration's PAPI.
 */
export async function encodeDcaScheduleCall(
  network: NetworkType,
  params: DcaScheduleParams
) {
  const hydrationApi = await getHydrationApi(network);

  const dcaCall = hydrationApi.tx.DCA.schedule({
    schedule: {
      owner: params.owner,
      period: params.period,
      total_amount: params.total_amount,
      max_retries: params.max_retries,
      stability_threshold: params.stability_threshold,
      slippage: params.slippage,
      order: Enum('Sell', {
        asset_in: params.order.asset_in,
        asset_out: params.order.asset_out,
        amount_in: params.order.amount_in,
        min_amount_out: params.order.min_amount_out,
        route: [],
      }),
    },
    start_execution_block: undefined,
  });

  return await dcaCall.getEncodedData();
}

/**
 * Calculate total number of DCA trades based on duration and frequency
 */
export function calculateTotalTrades(
  durationDays: number,
  frequencyBlocks: number
): number {
  const totalBlocks = durationDays * TIMING.BLOCKS_PER_DAY;
  return Math.floor(totalBlocks / frequencyBlocks);
}

/**
 * Calculate DOT amount per trade
 */
export function calculateDotPerTrade(
  totalDotAmount: bigint,
  totalTrades: number
): bigint {
  if (totalTrades === 0) return 0n;
  return totalDotAmount / BigInt(totalTrades);
}

/**
 * Estimate HOLLAR output for a given DOT amount and DOT price in USD.
 * HOLLAR is USD-pegged, so 1 HOLLAR ≈ 1 USD.
 *
 * Bigint throughout: floats lose precision when scaled to 18 decimals beyond ~2^53.
 * Price kept as a fixed-point micro-USD value:
 *
 *   hollar18 = (dot_planck / 10^10) * (priceMicroUsd / 10^6) * 10^18
 *            = (dot_planck * priceMicroUsd) * 10^2
 */
export function estimateHollarFromDot(
  dotAmountPlanck: bigint,
  dotPriceInUsd: number
): bigint {
  const dotPriceMicroUsd = BigInt(Math.floor(dotPriceInUsd * 1e6));
  return dotAmountPlanck * dotPriceMicroUsd * 100n;
}

const sovereignCache = new Map<NetworkType, string>();

/**
 * Resolve the Hydration AccountId for the Fellowship Treasury pallet sovereign.
 *
 * The combined V5 setup XCM enters Hydration via Asset Hub. `InitiateTransfer
 * { preserve_origin: true }` pushes `AliasOrigin((1,[Parachain(collectives),
 * PalletInstance(FELLOWSHIP_TREASURY_PALLET_INDEX)]))`, accepted by Hydration's
 * `AliasOriginRootUsingFilter<AssetHubLocation, RestrictedAssetHubAliases>`
 * (post-d026a6748: descendants of any system parachain). The Transact signs as
 * the SS58 derivation of that location via Hydration's `LocationToAccountId`.
 */
export async function getFellowshipTreasurySovereignOnHydration(
  network: NetworkType,
): Promise<string> {
  const cached = sovereignCache.get(network);
  if (cached) return cached;

  const hydrationApi = await getHydrationApi(network);
  const location = XcmVersionedLocation.V5(fellowshipTreasuryPalletLocationV5(network));
  const result = await hydrationApi.apis.LocationToAccountApi.convert_location(location);

  if (result.success === false || result.value === undefined) {
    throw new Error('Failed to convert Fellowship Treasury pallet location to Hydration account');
  }

  sovereignCache.set(network, result.value);
  return result.value;
}
