/**
 * Main Governance Proposal Builder
 * Combines treasury spend, DCA setup, and periodic returns into a complete proposal
 */

import type { NetworkType, StablecoinType } from '../api/constants';
import {
  getParachainId,
  ACCOUNTS,
  DEFAULTS,
  TIMING,
  daysToBlocks,
} from '../api/constants';
import type { XcmVersionedXcm } from './xcm-messages';
import {
  buildTreasuryToHydrationXcm,
  buildDcaScheduleXcm,
} from './xcm-messages';
import {
  buildDcaScheduleCalls,
  calculateSovereignAccount,
  calculateTotalTrades,
  calculateDotPerTrade,
  encodeDcaScheduleCall,
} from './dca-setup';
import {
  calculatePeriodicReturnParams,
  estimateTotalStablesAccumulated,
  buildPeriodicReturnSchedulerCall,
  validatePeriodicReturnParams,
  estimatePeriodicReturnFee,
} from './periodic-return';

/**
 * User Input Parameters for DCA Wizard
 */
export interface DcaWizardInputs {
  network: NetworkType;
  dotAmount: bigint;
  stablecoin: StablecoinType;
  dcaFrequencyBlocks: number;
  dcaDurationDays: number;
  slippagePercent: number;
  returnFrequencyDays: number;
  numberOfReturns: number;
  treasurySplitPercent: number;
  salarySplitPercent: number;
}

/**
 * Scheduler call input parameters
 */
export interface SchedulerCallInput {
  after: number;
  maybe_periodic: {
    period: number;
    repetitions: number;
  } | null;
  priority: number;
}

/**
 * Calculated values and estimates
 */
export interface DcaCalculations {
  totalTrades: number;
  dotPerTrade: bigint;
  estimatedUsdtTotal: bigint;
  estimatedUsdcTotal: bigint;
  estimatedUsdtPerReturn: bigint;
  estimatedUsdcPerReturn: bigint;
  totalDurationBlocks: number;
  sovereignAccount: string; // SS58 address
  feeEstimate: bigint;
}

/**
 * Complete proposal structure
 */
export interface DcaProposal {
  inputs: DcaWizardInputs;
  calculations: DcaCalculations;
  calls: {
    treasurySpend: XcmVersionedXcm;
    dcaSchedule: Array<{
      stablecoin: 'USDT' | 'USDC';
      schedulerCall: SchedulerCallInput;
      xcmCall: XcmVersionedXcm;
    }>;
    periodicReturn: {
      schedulerCall: SchedulerCallInput;
      xcmCall: XcmVersionedXcm;
    };
  };
  batchCall: Uint8Array | null; // The final Utility.batch_all call (needs chain API)
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Calculate fee estimate for the entire operation
 */
function calculateTotalFees(numberOfReturns: number): bigint {
  // Conservative fee estimates:
  // - Initial transfer to Hydration: 0.1 DOT
  // - DCA setup per schedule: 0.05 DOT
  // - Periodic return per execution: 0.1 USDT equivalent in DOT

  const initialTransferFee = BigInt(1e9); // 0.1 DOT (10 decimals)
  const dcaSetupFee = BigInt(5e8); // 0.05 DOT per DCA
  const periodicReturnFee = BigInt(1e9); // 0.1 DOT per return

  // Add buffer
  const bufferPercent = BigInt(DEFAULTS.FEE_BUFFER_PERCENT);
  const baseFees = initialTransferFee + dcaSetupFee * 2n + periodicReturnFee * BigInt(numberOfReturns);
  const totalFees = (baseFees * (100n + bufferPercent)) / 100n;

  return totalFees;
}

/**
 * Validate all input parameters
 */
function validateInputs(inputs: DcaWizardInputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (inputs.dotAmount <= 0n) {
    errors.push('DOT amount must be greater than 0');
  }

  if (inputs.dcaFrequencyBlocks < 10) {
    errors.push('DCA frequency must be at least 10 blocks');
  }

  if (inputs.dcaDurationDays <= 0) {
    errors.push('DCA duration must be greater than 0 days');
  }

  if (inputs.slippagePercent < 0.1 || inputs.slippagePercent > 10) {
    errors.push('Slippage must be between 0.1% and 10%');
  }

  if (inputs.numberOfReturns <= 0) {
    errors.push('Number of returns must be greater than 0');
  }

  if (inputs.treasurySplitPercent + inputs.salarySplitPercent !== 100) {
    errors.push('Treasury and salary split percentages must sum to 100');
  }

  // Validate periodic return schedule
  const periodicValidation = validatePeriodicReturnParams(
    inputs.returnFrequencyDays,
    inputs.numberOfReturns,
    inputs.dcaDurationDays
  );
  errors.push(...periodicValidation.errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate warnings for user consideration
 */
function generateWarnings(inputs: DcaWizardInputs): string[] {
  const warnings: string[] = [];

  // Warn if DCA trades are very frequent
  if (inputs.dcaFrequencyBlocks < 100) {
    warnings.push(
      'DCA frequency is very high. This may result in higher fees relative to trade size.'
    );
  }

  // Warn if DOT amount is very large
  const largeAmount = BigInt(10000) * BigInt(10 ** 10); // 10,000 DOT
  if (inputs.dotAmount > largeAmount) {
    warnings.push(
      'This is a large DOT amount. Consider testing with smaller amounts first on Paseo testnet.'
    );
  }

  // Warn if slippage is high
  if (inputs.slippagePercent > 5) {
    warnings.push(
      'High slippage tolerance may result in unfavorable trade execution.'
    );
  }

  // Warn about price volatility
  warnings.push(
    'Estimates assume current DOT price. Actual stablecoin amounts will vary with market prices.'
  );

  // Warn about governance execution time
  warnings.push(
    'This proposal must pass through governance voting before execution. This typically takes 2-4 weeks.'
  );

  return warnings;
}

/**
 * Build complete DCA governance proposal
 */
export async function buildDcaProposal(
  inputs: DcaWizardInputs,
  dotPriceInUsd: number = 5.0 // Default price, should come from oracle
): Promise<DcaProposal> {
  // Validate inputs
  const validation = validateInputs(inputs);
  if (!validation.valid) {
    return {
      inputs,
      calculations: {} as DcaCalculations,
      calls: {} as any,
      batchCall: null,
      validation: {
        valid: false,
        errors: validation.errors,
        warnings: [],
      },
    };
  }

  // Calculate sovereign account for Collectives parachain
  const collectivesParaId = getParachainId(inputs.network, 'COLLECTIVES');
  const sovereignAccount = calculateSovereignAccount(collectivesParaId);

  // Calculate DCA parameters
  const totalTrades = calculateTotalTrades(inputs.dcaDurationDays, inputs.dcaFrequencyBlocks);
  const dotPerTrade = calculateDotPerTrade(inputs.dotAmount, totalTrades);

  // Estimate stablecoin accumulation
  const { usdt: estimatedUsdtTotal, usdc: estimatedUsdcTotal } = estimateTotalStablesAccumulated(
    inputs.dotAmount,
    dotPriceInUsd,
    inputs.stablecoin
  );

  // Calculate fees
  const feeEstimate = calculateTotalFees(inputs.numberOfReturns);

  // Calculate periodic return parameters
  const periodicReturnSchedule = calculatePeriodicReturnParams(
    inputs.returnFrequencyDays,
    inputs.numberOfReturns,
    estimatedUsdtTotal,
    estimatedUsdcTotal
  );

  const calculations: DcaCalculations = {
    totalTrades,
    dotPerTrade,
    estimatedUsdtTotal,
    estimatedUsdcTotal,
    estimatedUsdtPerReturn: periodicReturnSchedule.usdtAmountPerReturn,
    estimatedUsdcPerReturn: periodicReturnSchedule.usdcAmountPerReturn,
    totalDurationBlocks: daysToBlocks(inputs.dcaDurationDays),
    sovereignAccount,
    feeEstimate,
  };

  // Build calls

  // 1. Treasury spend - send DOT to Hydration
  const treasurySpend = buildTreasuryToHydrationXcm(
    inputs.network,
    inputs.dotAmount,
    feeEstimate
  );

  // 2. DCA schedule - set up DCA on Hydration (after warm-up period)
  const dcaScheduleCalls = buildDcaScheduleCalls(
    inputs.network,
    sovereignAccount,
    inputs.stablecoin,
    inputs.dcaFrequencyBlocks,
    inputs.slippagePercent
  );

  const dcaSchedule = await Promise.all(
    dcaScheduleCalls.map(async (dca) => {
      // Encode the DCA.schedule call using Hydration API
      const dcaCallEncoded = await encodeDcaScheduleCall(inputs.network, dca.params);

      // Build XCM to schedule DCA
      const xcmCall = buildDcaScheduleXcm(
        inputs.network,
        dcaCallEncoded,
        BigInt(5e8) // 0.05 DOT for fees
      );

      return {
        stablecoin: dca.stablecoin,
        schedulerCall: {
          after: TIMING.WARM_UP_BLOCKS,
          maybe_periodic: null, // One-time execution
          priority: 128,
        },
        xcmCall,
      };
    })
  );

  // 3. Periodic return - schedule periodic transfers back to Asset Hub
  const periodicReturnFee = estimatePeriodicReturnFee();
  const periodicReturn = buildPeriodicReturnSchedulerCall(
    inputs.network,
    periodicReturnSchedule,
    periodicReturnFee,
    inputs.treasurySplitPercent
  );

  // Generate warnings
  const warnings = generateWarnings(inputs);

  return {
    inputs,
    calculations,
    calls: {
      treasurySpend,
      dcaSchedule,
      periodicReturn,
    },
    batchCall: null, // Will be populated when chain API is available
    validation: {
      valid: true,
      errors: [],
      warnings,
    },
  };
}

/**
 * Encode the final batch call for the referendum
 * Uses the Asset Hub chain's TypedApi from polkadot-api via smoldot light client
 */
export async function encodeBatchCall(
  proposal: DcaProposal
) {
  const { getAssetHubApi } = await import('../api/clients/dotAh');
  const { Enum } = await import('polkadot-api');
  const { DispatchRawOrigin, XcmVersionedLocation, XcmV5Junctions, XcmV5Junction } = await import('@polkadot-api/descriptors');

  // Get the typed API (connects via smoldot light client)
  const ahApi = await getAssetHubApi(proposal.inputs.network);
  const hydrationParaId = getParachainId(proposal.inputs.network, 'HYDRATION');

  // Build the destination location for Hydration
  const hydrationDest = XcmVersionedLocation.V5({
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(hydrationParaId)),
  });

  // 1. Treasury Spend - Send DOT to Hydration
  // NOTE: The treasury has an associated account (ACCOUNTS.TREASURY) that holds funds.
  // Using dispatch_as with Signed origin is valid because this call will be executed
  // via a referendum with Root origin, which has permission to dispatch_as any account.
  // The referendum's Root origin grants the authority to act on behalf of the treasury account.
  const treasuryCall = ahApi.tx.Utility.dispatch_as({
    as_origin: Enum('system', DispatchRawOrigin.Signed(ACCOUNTS.TREASURY)),
    call: ahApi.tx.PolkadotXcm.execute({
      message: proposal.calls.treasurySpend,
      max_weight: { ref_time: 10_000_000_000n, proof_size: 100_000n },
    }).decodedCall,
  }).decodedCall;

  // 2. Schedule DCA Setup calls (one or two depending on stablecoin selection)
  const dcaScheduleCalls = proposal.calls.dcaSchedule.map((dcaSchedule) =>
    ahApi.tx.Scheduler.schedule_after({
      after: TIMING.WARM_UP_BLOCKS,
      maybe_periodic: undefined,
      priority: 128,
      call: ahApi.tx.PolkadotXcm.send({
        dest: hydrationDest,
        message: dcaSchedule.xcmCall,
      }).decodedCall,
    }).decodedCall
  );

  // 3. Schedule Periodic Returns
  const { schedulerCall } = proposal.calls.periodicReturn;
  if (!schedulerCall.maybe_periodic) {
    throw new Error('Periodic return schedulerCall must have maybe_periodic defined');
  }
  const periodicCall = ahApi.tx.Scheduler.schedule_after({
    after: schedulerCall.after,
    maybe_periodic: [
      schedulerCall.maybe_periodic.period,
      schedulerCall.maybe_periodic.repetitions,
    ],
    priority: 128,
    call: ahApi.tx.PolkadotXcm.send({
      dest: hydrationDest,
      message: proposal.calls.periodicReturn.xcmCall,
    }).decodedCall,
  }).decodedCall;

  // Combine all calls
  const allCalls = [treasuryCall, ...dcaScheduleCalls, periodicCall];

  // Create the batch_all call
  const batchCall = ahApi.tx.Utility.batch_all({ calls: allCalls });
  const encoded = await batchCall.getEncodedData();
  return encoded.asHex();
}

/**
 * Helper to format proposal for display
 */
export function formatProposalSummary(proposal: DcaProposal): string {
  const { inputs, calculations } = proposal;

  return `
DCA Wizard Proposal Summary
===========================

Network: ${inputs.network === 'polkadot' ? 'Polkadot Mainnet' : 'Paseo Testnet'}
DOT Amount: ${Number(inputs.dotAmount) / 1e10} DOT
Target Stablecoin: ${inputs.stablecoin}

DCA Configuration:
- Frequency: Every ${inputs.dcaFrequencyBlocks} blocks (~${(inputs.dcaFrequencyBlocks * 6) / 60} minutes)
- Duration: ${inputs.dcaDurationDays} days
- Total Trades: ${calculations.totalTrades}
- DOT per Trade: ${Number(calculations.dotPerTrade) / 1e10} DOT
- Slippage Tolerance: ${inputs.slippagePercent}%

Estimated Output:
- USDT: ${Number(calculations.estimatedUsdtTotal) / 1e6}
- USDC: ${Number(calculations.estimatedUsdcTotal) / 1e6}

Return Schedule:
- Frequency: Every ${inputs.returnFrequencyDays} day(s)
- Number of Returns: ${inputs.numberOfReturns}
- USDT per Return: ${Number(calculations.estimatedUsdtPerReturn) / 1e6}
- USDC per Return: ${Number(calculations.estimatedUsdcPerReturn) / 1e6}

Split Configuration:
- Fellowship Treasury: ${inputs.treasurySplitPercent}%
- Fellowship Salary: ${inputs.salarySplitPercent}%

Estimated Fees: ${Number(calculations.feeEstimate) / 1e10} DOT
  `.trim();
}
