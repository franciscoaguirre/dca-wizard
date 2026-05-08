/**
 * Periodic Return Logic
 * Handles the periodic transfer of HOLLAR from Hydration back to Asset Hub
 * with a configurable split to Fellowship Treasury and Salary accounts.
 */

import { DEFAULTS, daysToBlocks } from '../api/constants';

export interface PeriodicReturnSchedule {
  initialDelayBlocks: number;
  periodBlocks: number;
  repetitions: number;
  hollarAmountPerReturn: bigint;
}

/**
 * Build the schedule from an already-computed per-return amount. The caller
 * (the proposal builder) decides the per-return amount: for `both` mode it
 * comes from the DCA accumulation rate × return period; for `return` mode it
 * is provided directly by the user.
 */
export function calculatePeriodicReturnParams(
  returnFrequencyDays: number,
  repetitions: number,
  hollarAmountPerReturn: bigint,
): PeriodicReturnSchedule {
  const periodBlocks = daysToBlocks(returnFrequencyDays);
  return {
    initialDelayBlocks: periodBlocks,
    periodBlocks,
    repetitions,
    hollarAmountPerReturn,
  };
}

/**
 * Per-return amount sized to the DCA accumulation rate over one return period,
 * minus a buffer to absorb price drift, execution slippage, and timing skew
 * between trade settlement and return execution.
 *
 *   hollarPerReturn = totalHollarAccumulated
 *                   × (returnPeriodBlocks / totalDcaDurationBlocks)
 *                   × (1 - RETURN_BUFFER_PERCENT/100)
 */
export function calculateRateBasedHollarPerReturn(
  totalHollarAccumulated: bigint,
  returnFrequencyDays: number,
  totalDcaDurationBlocks: number,
): bigint {
  if (totalDcaDurationBlocks <= 0) return 0n;
  const returnPeriodBlocks = daysToBlocks(returnFrequencyDays);
  const gross =
    (totalHollarAccumulated * BigInt(returnPeriodBlocks)) /
    BigInt(totalDcaDurationBlocks);
  return (gross * BigInt(100 - DEFAULTS.RETURN_BUFFER_PERCENT)) / 100n;
}

/**
 * Number of full return cycles that fit within the DCA duration. The last
 * partial period (if any) is dropped — its HOLLAR remains on the sovereign
 * for the next governance action to sweep.
 */
export function calculateNumberOfReturns(
  dcaDurationDays: number,
  returnFrequencyDays: number,
): number {
  if (returnFrequencyDays <= 0) return 0;
  return Math.max(1, Math.floor(dcaDurationDays / returnFrequencyDays));
}
