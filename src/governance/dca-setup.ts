/**
 * DCA Setup Logic
 * Builds the DCA.schedule call that will be executed on Hydration
 */

import type { NetworkType, StablecoinType } from '../api/constants';
import {
  getHydrationAssetId,
  DCA_CONFIG,
  TIMING,
} from '../api/constants';

/**
 * DCA Order Type
 * Represents a swap from one asset to another
 */
export interface DcaOrder {
  asset_in: number; // Asset ID to sell (DOT)
  asset_out: number; // Asset ID to buy (USDT or USDC)
  amount_in: bigint; // Amount per trade
  min_amount_out: bigint; // Minimum expected output (after slippage)
}

/**
 * DCA Schedule Parameters
 * These parameters are passed to the DCA.schedule call on Hydration
 */
export interface DcaScheduleParams {
  owner: string; // Sovereign account SS58 address (Collectives parachain)
  period: number; // Blocks between trades
  total_amount: bigint; // 0 = continuous until depleted
  max_retries: number; // Number of retry attempts
  stability_threshold: number; // Price stability threshold (basis points)
  slippage: number; // Maximum slippage (basis points)
  order: DcaOrder;
}

/**
 * Calculate DCA parameters from user inputs
 */
export function calculateDcaParams(
  network: NetworkType,
  sovereignAccount: string,
  stablecoin: 'USDT' | 'USDC',
  dcaFrequencyBlocks: number,
  slippagePercent: number,
  dotPerTrade: bigint,
  expectedOutputPerTrade: bigint
): DcaScheduleParams {
  const dotAssetId = getHydrationAssetId(network, 'DOT');
  const stablecoinAssetId = getHydrationAssetId(network, stablecoin);

  // Convert percentage to per million (1% = 10,000 per million)
  const slippagePerMillion = Math.floor(slippagePercent * 10_000);
  const stabilityPerMillion = DCA_CONFIG.STABILITY_THRESHOLD_PERCENT * 10_000;

  // Calculate min_amount_out with slippage protection
  const minAmountOut = (expectedOutputPerTrade * BigInt(100 - Math.floor(slippagePercent))) / 100n;

  return {
    owner: sovereignAccount,
    period: dcaFrequencyBlocks,
    total_amount: 0n, // 0 means use all available balance
    max_retries: DCA_CONFIG.MAX_RETRIES,
    stability_threshold: stabilityPerMillion,
    slippage: slippagePerMillion,
    order: {
      asset_in: dotAssetId,
      asset_out: stablecoinAssetId,
      amount_in: dotPerTrade,
      min_amount_out: minAmountOut,
    },
  };
}

/**
 * Encode DCA.schedule call
 * Uses the Hydration chain's TypedApi from polkadot-api
 */
export async function encodeDcaScheduleCall(
  network: NetworkType,
  params: DcaScheduleParams
) {
  const { getHydrationApi } = await import('../api/clients/hydration');
  const { Enum } = await import('polkadot-api');

  // Get the typed API (will connect to chain via smoldot)
  const hydrationApi = await getHydrationApi(network);

  // Create the DCA.schedule call
  const dcaCall = hydrationApi.tx.DCA.schedule({
    schedule: {
      owner: params.owner, // SS58 string
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

  // Get the encoded call data
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
 * Estimate stablecoin output per trade
 * Requires price feed - for now returns estimate based on provided price
 */
export function estimateStablecoinPerTrade(
  dotPerTrade: bigint,
  dotPriceInUsd: number,
  stablecoinDecimals: number = 6
): bigint {
  // DOT has 10 decimals, stablecoins typically have 6
  const dotInFloat = Number(dotPerTrade) / 1e10;
  const usdValue = dotInFloat * dotPriceInUsd;
  return BigInt(Math.floor(usdValue * 10 ** stablecoinDecimals));
}

/**
 * Build DCA setup calls for the governance proposal
 * Returns an array of DCA schedule calls (one or two, depending on stablecoin selection)
 */
export function buildDcaScheduleCalls(
  network: NetworkType,
  sovereignAccount: string,
  stablecoin: StablecoinType,
  dcaFrequencyBlocks: number,
  slippagePercent: number,
  dotPerTrade: bigint,
  expectedOutputPerTrade: bigint
): Array<{ stablecoin: 'USDT' | 'USDC'; params: DcaScheduleParams }> {
  const calls: Array<{ stablecoin: 'USDT' | 'USDC'; params: DcaScheduleParams }> = [];

  // When BOTH stablecoins are selected, split the amounts
  const dotPerTradePerCoin = stablecoin === 'BOTH' ? dotPerTrade / 2n : dotPerTrade;
  const expectedOutputPerCoin = stablecoin === 'BOTH' ? expectedOutputPerTrade / 2n : expectedOutputPerTrade;

  if (stablecoin === 'USDT' || stablecoin === 'BOTH') {
    calls.push({
      stablecoin: 'USDT',
      params: calculateDcaParams(
        network,
        sovereignAccount,
        'USDT',
        dcaFrequencyBlocks,
        slippagePercent,
        dotPerTradePerCoin,
        expectedOutputPerCoin
      ),
    });
  }

  if (stablecoin === 'USDC' || stablecoin === 'BOTH') {
    calls.push({
      stablecoin: 'USDC',
      params: calculateDcaParams(
        network,
        sovereignAccount,
        'USDC',
        dcaFrequencyBlocks,
        slippagePercent,
        dotPerTradePerCoin,
        expectedOutputPerCoin
      ),
    });
  }

  return calls;
}

/**
 * Get sovereign account address for a parachain on Hydration
 * Uses Hydration's LocationToAccountApi runtime API for accurate conversion
 */
export async function getSovereignAccount(
  network: NetworkType,
  parachainId: number
): Promise<string> {
  const { getHydrationApi } = await import('../api/clients/hydration');
  const { HydrationXcmVersionedLocation, XcmV3Junctions, XcmV3Junction, XcmV3JunctionBodyId, XcmV2JunctionBodyPart } = await import('@polkadot-api/descriptors');

  const hydrationApi = await getHydrationApi(network);

  // Build the versioned XCM location for the Plurality sovereign (from Hydration's perspective)
  // When PolkadotXcm.send() is called with Architects origin, the pallet prepends
  // DescendOrigin(Plurality(Treasury, Voice)). On Hydration this means the origin is
  // (1, [Parachain(collectivesParaId), Plurality(Treasury, Voice)]) — a different
  // account from the plain parachain sovereign. All DOT/stables must be deposited here.
  const location = HydrationXcmVersionedLocation.V4({
    parents: 1,
    interior: XcmV3Junctions.X2([
      XcmV3Junction.Parachain(parachainId),
      XcmV3Junction.Plurality({
        id: XcmV3JunctionBodyId.Treasury(),
        part: XcmV2JunctionBodyPart.Voice(),
      }),
    ]),
  });

  // Use Hydration's runtime API to convert location to account
  const result = await hydrationApi.apis.LocationToAccountApi.convert_location(location);

  if (result.success === false || result.value === undefined) {
    throw new Error(`Failed to convert location to account for parachain ${parachainId}`);
  }

  return result.value;
}
