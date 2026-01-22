/**
 * DCA Setup Logic
 * Builds the DCA.schedule call that will be executed on Hydration
 */

import { blake2b } from '@noble/hashes/blake2.js';
import { base58 } from '@scure/base';
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
        min_amount_out: 0n, // No minimum for DCA
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
 * This is a deterministic calculation that doesn't require a chain connection
 * Formula: SS58Encode(blake2_256("para" + little_endian_encode(parachain_id)))
 */
export function calculateSovereignAccount(
  _network: NetworkType,
  parachainId: number
): string {
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
  const hash = blake2b(input, { dkLen: 32 });

  // Convert to SS58 address using base58 encoding with Substrate prefix
  // Substrate SS58 format with prefix 42 (generic substrate)
  const prefix42 = new Uint8Array([42]);
  const SS58_PREFIX = new TextEncoder().encode('SS58PRE');

  // Compute checksum
  const checksumInput = new Uint8Array(SS58_PREFIX.length + prefix42.length + hash.length);
  checksumInput.set(SS58_PREFIX);
  checksumInput.set(prefix42, SS58_PREFIX.length);
  checksumInput.set(hash, SS58_PREFIX.length + prefix42.length);
  const checksum = blake2b(checksumInput, { dkLen: 64 }).slice(0, 2);

  // Combine prefix + hash + checksum
  const ss58Bytes = new Uint8Array(prefix42.length + hash.length + checksum.length);
  ss58Bytes.set(prefix42);
  ss58Bytes.set(hash, prefix42.length);
  ss58Bytes.set(checksum, prefix42.length + hash.length);

  return base58.encode(ss58Bytes);
}
