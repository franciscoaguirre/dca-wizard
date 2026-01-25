/**
 * Periodic Return Logic
 * Handles the periodic transfer of stablecoins from Hydration back to Asset Hub
 * with automatic 70/30 split to Fellowship Treasury and Salary accounts
 */

import type { NetworkType, StablecoinType } from '../api/constants';
import { daysToBlocks } from '../api/constants';
import { buildPeriodicReturnXcm } from './xcm-messages';

/**
 * Periodic Return Schedule Parameters
 */
export interface PeriodicReturnSchedule {
  initialDelayBlocks: number; // When to start returns (after DCA accumulates stables)
  periodBlocks: number; // How often to return funds
  repetitions: number; // Number of returns
  usdtAmountPerReturn: bigint; // Amount of USDT per return
  usdcAmountPerReturn: bigint; // Amount of USDC per return
}

/**
 * Calculate periodic return parameters
 */
export function calculatePeriodicReturnParams(
  returnFrequencyDays: number,
  numberOfReturns: number,
  totalUsdtAccumulated: bigint,
  totalUsdcAccumulated: bigint
): PeriodicReturnSchedule {
  const periodBlocks = daysToBlocks(returnFrequencyDays);
  const initialDelayBlocks = periodBlocks; // First return after one period

  // Calculate amount per return
  const usdtAmountPerReturn = numberOfReturns > 0
    ? totalUsdtAccumulated / BigInt(numberOfReturns)
    : 0n;
  const usdcAmountPerReturn = numberOfReturns > 0
    ? totalUsdcAccumulated / BigInt(numberOfReturns)
    : 0n;

  return {
    initialDelayBlocks,
    periodBlocks,
    repetitions: numberOfReturns,
    usdtAmountPerReturn,
    usdcAmountPerReturn,
  };
}

/**
 * Calculate total stablecoin accumulated estimates
 * This requires price information which should come from an oracle or API
 */
export function estimateTotalStablesAccumulated(
  totalDotAmount: bigint,
  dotPriceInUsd: number,
  stablecoin: StablecoinType,
  stablecoinDecimals: number = 6
): { usdt: bigint; usdc: bigint } {
  // Convert DOT to USD value
  const dotInFloat = Number(totalDotAmount) / 1e10;
  const totalUsdValue = dotInFloat * dotPriceInUsd;
  const totalUsdBigInt = BigInt(Math.floor(totalUsdValue * 10 ** stablecoinDecimals));

  // Split based on stablecoin selection
  if (stablecoin === 'USDT') {
    return { usdt: totalUsdBigInt, usdc: 0n };
  } else if (stablecoin === 'USDC') {
    return { usdt: 0n, usdc: totalUsdBigInt };
  } else {
    // BOTH - split 50/50
    const half = totalUsdBigInt / 2n;
    return { usdt: half, usdc: half };
  }
}

/**
 * Calculate split amounts for Treasury (70%) and Salary (30%)
 */
export interface SplitAmounts {
  treasury: bigint;
  salary: bigint;
}

export function calculateSplitAmounts(
  totalAmount: bigint,
  treasuryPercent: number,
  salaryPercent: number
): SplitAmounts {
  if (treasuryPercent + salaryPercent !== 100) {
    throw new Error('Treasury and salary percentages must sum to 100');
  }

  const treasury = (totalAmount * BigInt(treasuryPercent)) / 100n;
  const salary = totalAmount - treasury; // Use remainder to avoid rounding issues

  return { treasury, salary };
}

/**
 * Estimate DOT fee for periodic return XCM execution on Hydration
 * This is paid from the Asset Hub sovereign's fee stash
 */
export function estimatePeriodicReturnFee(): bigint {
  // Conservative estimate: 0.05 DOT per return for XCM fees on Hydration
  // In production, this should query the actual fee schedule
  return BigInt(5e8); // 0.05 DOT (10 decimals)
}

/**
 * Build the scheduler call for periodic returns
 * This creates a Scheduler.schedule_after call with maybe_periodic set
 */
export interface SchedulerCall {
  after: number; // Blocks to wait before first execution
  maybe_periodic: {
    period: number; // Blocks between executions
    repetitions: number; // Number of times to repeat
  } | null;
  priority: number;
}

/**
 * Build periodic return scheduler calls
 * Returns calls for the governance proposal that schedule periodic XCM returns
 */
export function buildPeriodicReturnSchedulerCall(
  network: NetworkType,
  schedule: PeriodicReturnSchedule,
  feeAmount: bigint,
  treasurySplitPercent: number = 70
): {
  schedulerCall: {
    after: number;
    maybe_periodic: { period: number; repetitions: number };
    priority: number;
  };
  xcmCall: ReturnType<typeof buildPeriodicReturnXcm>;
} {
  // Build the XCM message for periodic returns with user-specified split
  const xcmCall = buildPeriodicReturnXcm(
    network,
    schedule.usdtAmountPerReturn,
    schedule.usdcAmountPerReturn,
    feeAmount,
    treasurySplitPercent
  );

  // Build the scheduler call
  const schedulerCall = {
    after: schedule.initialDelayBlocks,
    maybe_periodic: {
      period: schedule.periodBlocks,
      repetitions: schedule.repetitions,
    },
    priority: 128, // Medium priority
  };

  return {
    schedulerCall,
    xcmCall,
  };
}

/**
 * Validate periodic return parameters
 */
export function validatePeriodicReturnParams(
  returnFrequencyDays: number,
  numberOfReturns: number,
  _totalDcaDurationDays: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (returnFrequencyDays <= 0) {
    errors.push('Return frequency must be greater than 0 days');
  }

  if (numberOfReturns <= 0) {
    errors.push('Number of returns must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
