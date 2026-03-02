/**
 * Main Governance Proposal Builder
 * Builds a single batched proposal on Collectives (Architects track) containing:
 * 1. Transfer DOT from Fellowship Treasury to Hydration (immediate)
 * 2. Start DCA on Hydration (scheduled after warmup)
 * 3. Periodic return of stablecoins (scheduled, repeating)
 */

import type { NetworkType, StablecoinType } from '../api/constants';
import {
  getParachainId,
  DEFAULTS,
  TIMING,
  daysToBlocks,
} from '../api/constants';
import {
  buildTreasuryToHydrationXcm,
  buildDcaScheduleXcm,
} from './xcm-messages';
import {
  buildDcaScheduleCalls,
  getSovereignAccount,
  calculateTotalTrades,
  calculateDotPerTrade,
  encodeDcaScheduleCall,
  estimateStablecoinPerTrade,
} from './dca-setup';
import {
  calculatePeriodicReturnParams,
  buildPeriodicReturnSchedulerCall,
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
  sovereignAccount: string;
  feeEstimate: bigint;
  feeStash: bigint;
}

/**
 * Complete proposal structure
 */
export interface DcaProposal {
  inputs: DcaWizardInputs;
  calculations: DcaCalculations;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Calculate fee estimate for all XCM operations
 */
function calculateFeeEstimate(): bigint {
  // Conservative fee estimate:
  // - Transfer DOT: ~0.05 DOT (Hydration deposit side, Asset Hub is UnpaidExecution)
  // - Start DCA: ~0.05 DOT (Hydration transact)
  // - Each periodic return: ~0.05 DOT (Hydration + Asset Hub)
  const totalFee = BigInt(25e8); // 0.25 DOT total
  const bufferPercent = BigInt(DEFAULTS.FEE_BUFFER_PERCENT);
  return (totalFee * (100n + bufferPercent)) / 100n;
}

/**
 * Calculate DOT to reserve as fee stash on Hydration for all operations
 */
function calculateFeeStash(numberOfReturns: number): bigint {
  const perOpFee = BigInt(5e8); // 0.05 DOT per operation
  // Fee for DCA start + all periodic returns
  const totalOps = BigInt(1 + numberOfReturns);
  const bufferPercent = BigInt(DEFAULTS.FEE_BUFFER_PERCENT);
  return (perOpFee * totalOps * (100n + bufferPercent)) / 100n;
}

/**
 * Estimate total stablecoins accumulated from DCA
 */
export function estimateTotalStablesAccumulated(
  totalDotAmount: bigint,
  dotPriceInUsd: number,
  stablecoin: StablecoinType,
  stablecoinDecimals: number = 6
): { usdt: bigint; usdc: bigint } {
  const dotInFloat = Number(totalDotAmount) / 1e10;
  const totalUsdValue = dotInFloat * dotPriceInUsd;
  const totalUsdBigInt = BigInt(Math.floor(totalUsdValue * 10 ** stablecoinDecimals));

  if (stablecoin === 'USDT') {
    return { usdt: totalUsdBigInt, usdc: 0n };
  } else if (stablecoin === 'USDC') {
    return { usdt: 0n, usdc: totalUsdBigInt };
  } else {
    const half = totalUsdBigInt / 2n;
    return { usdt: half, usdc: half };
  }
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

  if (inputs.treasurySplitPercent < 0 || inputs.treasurySplitPercent > 100) {
    errors.push('Treasury split must be between 0% and 100%');
  }

  if (inputs.returnFrequencyDays <= 0) {
    errors.push('Return frequency must be greater than 0 days');
  }

  if (inputs.numberOfReturns <= 0) {
    errors.push('Number of returns must be greater than 0');
  }

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

  if (inputs.dcaFrequencyBlocks < 100) {
    warnings.push(
      'DCA frequency is very high. This may result in higher fees relative to trade size.'
    );
  }

  const largeAmount = BigInt(10000) * BigInt(10 ** 10);
  if (inputs.dotAmount > largeAmount) {
    warnings.push(
      'This is a large DOT amount. Consider testing with smaller amounts first on Paseo testnet.'
    );
  }

  if (inputs.slippagePercent > 5) {
    warnings.push(
      'High slippage tolerance may result in unfavorable trade execution.'
    );
  }

  warnings.push(
    'Estimates assume current DOT price. Actual stablecoin amounts will vary with market prices.'
  );

  return warnings;
}

/**
 * Build the DCA proposal (calculations and validation only).
 * Call encodeBatchCall() to encode the complete batched proposal.
 */
export async function buildDcaProposal(
  inputs: DcaWizardInputs,
  dotPriceInUsd: number = 5.0
): Promise<DcaProposal> {
  const validation = validateInputs(inputs);
  if (!validation.valid) {
    return {
      inputs,
      calculations: {} as DcaCalculations,
      validation: {
        valid: false,
        errors: validation.errors,
        warnings: [],
      },
    };
  }

  // Get Plurality sovereign account on Hydration
  const collectivesParaId = getParachainId(inputs.network, 'COLLECTIVES');
  const sovereignAccount = await getSovereignAccount(inputs.network, collectivesParaId);

  // Calculate DCA parameters
  const totalTrades = calculateTotalTrades(inputs.dcaDurationDays, inputs.dcaFrequencyBlocks);
  const dotPerTrade = calculateDotPerTrade(inputs.dotAmount, totalTrades);

  // Estimate stablecoin accumulation
  const { usdt: estimatedUsdtTotal, usdc: estimatedUsdcTotal } = estimateTotalStablesAccumulated(
    inputs.dotAmount,
    dotPriceInUsd,
    inputs.stablecoin
  );

  // Calculate per-return amounts
  const periodicReturn = calculatePeriodicReturnParams(
    inputs.returnFrequencyDays,
    inputs.numberOfReturns,
    estimatedUsdtTotal,
    estimatedUsdcTotal
  );

  const feeEstimate = calculateFeeEstimate();
  const feeStash = calculateFeeStash(inputs.numberOfReturns);

  const calculations: DcaCalculations = {
    totalTrades,
    dotPerTrade,
    estimatedUsdtTotal,
    estimatedUsdcTotal,
    estimatedUsdtPerReturn: periodicReturn.usdtAmountPerReturn,
    estimatedUsdcPerReturn: periodicReturn.usdcAmountPerReturn,
    totalDurationBlocks: daysToBlocks(inputs.dcaDurationDays),
    sovereignAccount,
    feeEstimate,
    feeStash,
  };

  const warnings = generateWarnings(inputs);

  return {
    inputs,
    calculations,
    validation: {
      valid: true,
      errors: [],
      warnings,
    },
  };
}

/**
 * Encode the complete batched proposal call.
 *
 * Produces a single Utility.batch_all call on the Collectives chain containing:
 * 1. PolkadotXcm.send → Asset Hub (transfer DOT, immediate)
 * 2. Scheduler.schedule_after → PolkadotXcm.send → Hydration (start DCA)
 * 3. Scheduler.schedule_after(maybe_periodic) → PolkadotXcm.send → Hydration (returns)
 *
 * Returns the hex-encoded call data for the Collectives referendum.
 */
export async function encodeBatchCall(
  proposal: DcaProposal,
  dotPriceInUsd: number = 5.0
): Promise<string> {
  const { getCollectivesApi } = await import('../api/clients/collectives');
  const { XcmVersionedLocation, XcmV5Junctions, XcmV5Junction } = await import('@polkadot-api/descriptors');

  const collectivesApi = await getCollectivesApi(proposal.inputs.network);
  const assetHubParaId = getParachainId(proposal.inputs.network, 'ASSET_HUB');
  const hydrationParaId = getParachainId(proposal.inputs.network, 'HYDRATION');

  // Destinations
  const assetHubDest = XcmVersionedLocation.V5({
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(assetHubParaId)),
  });

  const hydrationDest = XcmVersionedLocation.V5({
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(hydrationParaId)),
  });

  // ---- Step 1: Transfer DOT (immediate) ----
  const treasuryXcm = buildTreasuryToHydrationXcm(
    proposal.inputs.network,
    proposal.inputs.dotAmount,
    proposal.calculations.feeStash
  );

  const transferCall = collectivesApi.tx.PolkadotXcm.send({
    dest: assetHubDest,
    message: treasuryXcm,
  });

  // ---- Step 2: Start DCA (scheduled after warmup) ----
  const dotPerTrade = proposal.calculations.dotPerTrade;
  const expectedOutputPerTrade = estimateStablecoinPerTrade(dotPerTrade, dotPriceInUsd);

  const dcaScheduleCalls = buildDcaScheduleCalls(
    proposal.inputs.network,
    proposal.calculations.sovereignAccount,
    proposal.inputs.stablecoin,
    proposal.inputs.dcaFrequencyBlocks,
    proposal.inputs.slippagePercent,
    dotPerTrade,
    expectedOutputPerTrade
  );

  const encodedDcaCalls = await Promise.all(
    dcaScheduleCalls.map(dca => encodeDcaScheduleCall(proposal.inputs.network, dca.params))
  );

  const dcaCallEncoded = encodedDcaCalls[0];

  const dcaFeeAmount = BigInt(5e8); // 0.05 DOT
  const dcaXcm = buildDcaScheduleXcm(dcaCallEncoded, dcaFeeAmount);

  const dcaSendCall = collectivesApi.tx.PolkadotXcm.send({
    dest: hydrationDest,
    message: dcaXcm,
  });

  const dcaSchedulerCall = collectivesApi.tx.Scheduler.schedule_after({
    after: TIMING.WARM_UP_BLOCKS,
    maybe_periodic: undefined,
    priority: 128,
    call: dcaSendCall.decodedCall,
  });

  // ---- Step 3: Periodic returns (scheduled with maybe_periodic) ----
  const { usdt: estimatedUsdtTotal, usdc: estimatedUsdcTotal } = estimateTotalStablesAccumulated(
    proposal.inputs.dotAmount,
    dotPriceInUsd,
    proposal.inputs.stablecoin
  );

  const periodicReturnParams = calculatePeriodicReturnParams(
    proposal.inputs.returnFrequencyDays,
    proposal.inputs.numberOfReturns,
    estimatedUsdtTotal,
    estimatedUsdcTotal
  );

  const returnFeeAmount = estimatePeriodicReturnFee();

  const periodicReturn = buildPeriodicReturnSchedulerCall(
    proposal.inputs.network,
    periodicReturnParams,
    returnFeeAmount,
    proposal.inputs.treasurySplitPercent
  );

  const returnSendCall = collectivesApi.tx.PolkadotXcm.send({
    dest: hydrationDest,
    message: periodicReturn.xcmCall,
  });

  const returnSchedulerCall = collectivesApi.tx.Scheduler.schedule_after({
    after: periodicReturn.schedulerCall.after,
    maybe_periodic: periodicReturn.schedulerCall.maybe_periodic
      ? [periodicReturn.schedulerCall.maybe_periodic.period, periodicReturn.schedulerCall.maybe_periodic.repetitions] as [number, number]
      : undefined,
    priority: periodicReturn.schedulerCall.priority,
    call: returnSendCall.decodedCall,
  });

  // ---- Batch all three calls ----
  const batchCall = collectivesApi.tx.Utility.batch_all({
    calls: [
      transferCall.decodedCall,
      dcaSchedulerCall.decodedCall,
      returnSchedulerCall.decodedCall,
    ],
  });

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

Periodic Returns:
- Frequency: Every ${inputs.returnFrequencyDays} days
- Number of Returns: ${inputs.numberOfReturns}
- USDT per Return: ~${Number(calculations.estimatedUsdtPerReturn) / 1e6}
- USDC per Return: ~${Number(calculations.estimatedUsdcPerReturn) / 1e6}

Split Configuration:
- Fellowship Treasury: ${inputs.treasurySplitPercent}%
- Fellowship Salary: ${inputs.salarySplitPercent}%

Governance: Collectives chain, Architects track (Dan 4+)
Single batched proposal with Scheduler for DCA start and periodic returns.

Fees: ~${Number(calculations.feeEstimate) / 1e10} DOT
  `.trim();
}
