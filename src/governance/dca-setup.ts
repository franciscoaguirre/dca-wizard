/**
 * DCA Setup Logic
 * Builds the DCA.schedule call that will be executed on Hydration
 */

import { blake2b } from '@noble/hashes/blake2.js';
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
  amount_in: bigint; // Amount per trade (0 = use all available)
}

/**
 * DCA Schedule Parameters
 * These parameters are passed to the DCA.schedule call on Hydration
 */
export interface DcaScheduleParams {
  owner: Uint8Array; // Sovereign account (Collectives parachain)
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
  sovereignAccount: Uint8Array,
  stablecoin: 'USDT' | 'USDC',
  dcaFrequencyBlocks: number,
  slippagePercent: number
): DcaScheduleParams {
  const dotAssetId = getHydrationAssetId(network, 'DOT');
  const stablecoinAssetId = getHydrationAssetId(network, stablecoin);

  // Convert percentage to basis points (1% = 100 bp)
  const slippageBasisPoints = Math.floor(slippagePercent * 100);
  const stabilityBasisPoints = DCA_CONFIG.STABILITY_THRESHOLD_PERCENT * 100;

  return {
    owner: sovereignAccount,
    period: dcaFrequencyBlocks,
    total_amount: 0n, // 0 means use all available balance
    max_retries: DCA_CONFIG.MAX_RETRIES,
    stability_threshold: stabilityBasisPoints,
    slippage: slippageBasisPoints,
    order: {
      asset_in: dotAssetId,
      asset_out: stablecoinAssetId,
      amount_in: 0n, // 0 means divide total by number of periods
    },
  };
}

/**
 * Encode DCA.schedule call
 * In production, this would use the Hydration chain's TypedApi from polkadot-api
 * For now, we'll create a placeholder that needs to be connected to the actual API
 */
export function encodeDcaScheduleCall(
  _params: DcaScheduleParams
): Uint8Array {
  // This is a placeholder - in production, this would be:
  // const hydrationApi = getHydrationClient(network).getTypedApi(hydration);
  // return hydrationApi.tx.DCA.schedule({
  //   schedule: {
  //     owner: params.owner,
  //     period: params.period,
  //     total_amount: params.total_amount,
  //     max_retries: params.max_retries,
  //     stability_threshold: params.stability_threshold,
  //     slippage: params.slippage,
  //     order: params.order,
  //   },
  // }).encodedData;

  // For now, throw an error indicating this needs chain descriptors
  throw new Error(
    'encodeDcaScheduleCall requires Hydration chain descriptors. ' +
    'Run: papi add hydration -n hydration'
  );
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
  sovereignAccount: Uint8Array,
  stablecoin: StablecoinType,
  dcaFrequencyBlocks: number,
  slippagePercent: number
): Array<{ stablecoin: 'USDT' | 'USDC'; params: DcaScheduleParams }> {
  const calls: Array<{ stablecoin: 'USDT' | 'USDC'; params: DcaScheduleParams }> = [];

  if (stablecoin === 'USDT' || stablecoin === 'BOTH') {
    calls.push({
      stablecoin: 'USDT',
      params: calculateDcaParams(
        network,
        sovereignAccount,
        'USDT',
        dcaFrequencyBlocks,
        slippagePercent
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
        slippagePercent
      ),
    });
  }

  return calls;
}

/**
 * Calculate sovereign account address for a parachain
 * This is the account that the parachain controls on other chains
 * Formula: blake2_256("para" + encode(parachain_id)) truncated/padded to 32 bytes
 */
export function calculateSovereignAccount(parachainId: number): Uint8Array {
  // Encode parachain ID as 4-byte little-endian
  const parachainIdBytes = new Uint8Array(4);
  new DataView(parachainIdBytes.buffer).setUint32(0, parachainId, true);

  // Create the "para" prefix
  const prefix = new TextEncoder().encode('para');

  // Concatenate and hash
  const input = new Uint8Array(prefix.length + parachainIdBytes.length);
  input.set(prefix);
  input.set(parachainIdBytes, prefix.length);

  // Blake2b hash (32 bytes)
  return blake2b(input, { dkLen: 32 });
}
