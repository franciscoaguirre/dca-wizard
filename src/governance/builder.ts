/**
 * Main Governance Proposal Builder
 *
 * Emits one of:
 *   - setup  : single `PolkadotXcm.send → Asset Hub` call (combined V5 transfer +
 *              DCA.schedule Transact in one inbound XCM on Hydration)
 *   - return : single `Scheduler.schedule_after(periodic) → PolkadotXcm.send → AH`
 *              call (return XCM per cycle: AH → Hydration → AH)
 *   - both   : `Utility.batch_all` of [setup, return-scheduler] (2 calls)
 *
 * Custody account on Hydration is the Fellowship Treasury pallet sovereign — same
 * entity as the FT pallet on Collectives (and as the AliasOrigin target on AH).
 */

import type { NetworkType, ProposalMode, ProposalOrigin } from '../api/constants';
import {
  DEFAULTS,
  PER_HOP_FEE_PLANCK,
  daysToBlocks,
  getParachainId,
  ACCOUNTS,
} from '../api/constants';
import { XcmVersionedLocation, MultiAddress } from '@polkadot-api/descriptors';
import { getCollectivesApi } from '../api/clients/collectives';
import { getAssetHubApi } from '../api/clients/dotAh';
import {
  buildSetupXcm,
  buildPeriodicReturnXcm,
  parachainLocationV5,
  fellowshipTreasuryPalletLocationV5,
} from './xcm-messages';
import {
  getFellowshipTreasurySovereignOnHydration,
  calculateTotalTrades,
  calculateDotPerTrade,
  encodeDcaScheduleCall,
  calculateDcaParams,
  estimateHollarFromDot,
} from './dca-setup';
import {
  calculatePeriodicReturnParams,
  calculateRateBasedHollarPerReturn,
} from './periodic-return';

/**
 * User Input Parameters for DCA Wizard.
 *
 * Per-mode required fields:
 *   - setup  / both: dotAmount, dcaFrequencyBlocks, dcaDurationDays, slippagePercent
 *   - return / both: returnFrequencyDays, numberOfReturns, treasurySplitPercent, salarySplitPercent
 *   - return only:   hollarAmountPerReturn (HOLLAR sitting on the FT sovereign on
 *                    Hydration to divide across returns)
 */
export interface DcaWizardInputs {
  network: NetworkType;
  mode: ProposalMode;
  // Which treasury funds the DCA + which referendum authorizes it. Defaults to
  // 'fellowship' (the original Collectives Architects flow) when unset.
  origin?: ProposalOrigin;

  // Setup-mode inputs
  dotAmount?: bigint;
  dcaFrequencyBlocks?: number;
  dcaDurationDays?: number;
  slippagePercent?: number;

  // Return-mode inputs
  hollarAmountPerReturn?: bigint;
  returnFrequencyDays?: number;
  numberOfReturns?: number;
  treasurySplitPercent?: number;
  salarySplitPercent?: number;
}

/**
 * Derive the call-composition mode from the two UI toggles.
 * Returns null for the invalid "nothing selected" combination.
 */
export function deriveProposalMode(
  dcaEnabled: boolean,
  returnsEnabled: boolean,
): ProposalMode | null {
  if (dcaEnabled && returnsEnabled) return 'both';
  if (dcaEnabled && !returnsEnabled) return 'setup';
  if (!dcaEnabled && returnsEnabled) return 'return';
  return null;
}

/**
 * Calculated values and estimates
 */
export interface DcaCalculations {
  totalTrades: number;             // 0 when return-only
  dotPerTrade: bigint;             // 0n when return-only
  estimatedHollarTotal: bigint;    // 0n when return-only
  estimatedHollarPerReturn: bigint;
  totalDurationBlocks: number;     // 0 when return-only
  sovereignAccount: string;        // FT pallet sovereign on Hydration
  feeEstimate: bigint;
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

// Weight ceiling for the local PolkadotXcm.execute of the setup/return message on
// Asset Hub. Generous; the exact cost is validated in manual Chopsticks testing.
const EXECUTE_MAX_WEIGHT = {
  ref_time: 20_000_000_000n,
  proof_size: 2_000_000n,
} as const;

// DOT buffer added to the treasury spend to cover the setup XCM hop fees.
const SETUP_FEE_BUFFER_PLANCK = PER_HOP_FEE_PLANCK * 2n;

// ---------------------------------------------------------------------------
// Fee estimates
// ---------------------------------------------------------------------------

/**
 * Conservative DOT fee estimate (with buffer) for the proposal.
 *   - setup hop count: 2 (AH outer + Hydration inner)
 *   - return hop count per cycle: 3 (AH outer + Hydration inner + AH inner)
 */
function calculateFeeEstimate(mode: ProposalMode, numberOfReturns: number): bigint {
  let hops = 0n;
  if (mode !== 'return') hops += 2n;
  if (mode !== 'setup') hops += 3n * BigInt(numberOfReturns);
  const buffer = BigInt(DEFAULTS.FEE_BUFFER_PERCENT);
  return (PER_HOP_FEE_PLANCK * hops * (100n + buffer)) / 100n;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInputs(inputs: DcaWizardInputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const mode = inputs.mode;

  if (mode !== 'return') {
    if (!inputs.dotAmount || inputs.dotAmount <= 0n) {
      errors.push('DOT amount must be greater than 0');
    }
    if (!inputs.dcaFrequencyBlocks || inputs.dcaFrequencyBlocks < 10) {
      errors.push('DCA frequency must be at least 10 blocks');
    }
    if (!inputs.dcaDurationDays || inputs.dcaDurationDays <= 0) {
      errors.push('DCA duration must be greater than 0 days');
    }
    if (
      inputs.slippagePercent === undefined ||
      inputs.slippagePercent < 0.1 ||
      inputs.slippagePercent > 10
    ) {
      errors.push('Slippage must be between 0.1% and 10%');
    }
  }

  if (mode !== 'setup') {
    if (
      inputs.treasurySplitPercent === undefined ||
      inputs.treasurySplitPercent < 0 ||
      inputs.treasurySplitPercent > 100
    ) {
      errors.push('Treasury split must be between 0% and 100%');
    }
    if (!inputs.returnFrequencyDays || inputs.returnFrequencyDays <= 0) {
      errors.push('Return frequency must be greater than 0 days');
    }
    if (!inputs.numberOfReturns || inputs.numberOfReturns <= 0) {
      errors.push('Number of returns must be greater than 0');
    }
  }

  if (mode === 'return') {
    if (!inputs.hollarAmountPerReturn || inputs.hollarAmountPerReturn <= 0n) {
      errors.push('HOLLAR per return must be greater than 0');
    }
  }

  return { valid: errors.length === 0, errors };
}

function generateWarnings(inputs: DcaWizardInputs): string[] {
  const warnings: string[] = [];

  if (inputs.mode !== 'return') {
    if ((inputs.dcaFrequencyBlocks ?? 0) < 100) {
      warnings.push(
        'DCA frequency is very high. This may result in higher fees relative to trade size.'
      );
    }
    const largeAmount = BigInt(10000) * BigInt(10 ** 10);
    if ((inputs.dotAmount ?? 0n) > largeAmount) {
      warnings.push(
        'This is a large DOT amount. Consider testing with smaller amounts first on Paseo testnet.'
      );
    }
    if ((inputs.slippagePercent ?? 0) > 5) {
      warnings.push('High slippage tolerance may result in unfavorable trade execution.');
    }
    warnings.push(
      'Estimates assume current DOT price. Actual HOLLAR amounts will vary with market prices.'
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Build / encode
// ---------------------------------------------------------------------------

export async function buildDcaProposal(
  inputs: DcaWizardInputs,
  dotPriceInUsd: number,
): Promise<DcaProposal> {
  const validation = validateInputs(inputs);
  if (!validation.valid) {
    return {
      inputs,
      calculations: {} as DcaCalculations,
      validation: { valid: false, errors: validation.errors, warnings: [] },
    };
  }

  const sovereignAccount = await getFellowshipTreasurySovereignOnHydration(inputs.network);

  const mode = inputs.mode;
  const numberOfReturns = inputs.numberOfReturns ?? 0;

  let totalTrades = 0;
  let dotPerTrade = 0n;
  let totalDurationBlocks = 0;
  let estimatedHollarTotal = 0n;

  if (mode !== 'return') {
    totalTrades = calculateTotalTrades(inputs.dcaDurationDays!, inputs.dcaFrequencyBlocks!);
    dotPerTrade = calculateDotPerTrade(inputs.dotAmount!, totalTrades);
    totalDurationBlocks = daysToBlocks(inputs.dcaDurationDays!);
    estimatedHollarTotal = estimateHollarFromDot(inputs.dotAmount!, dotPriceInUsd);
  }

  let estimatedHollarPerReturn = 0n;
  if (mode !== 'setup') {
    if (mode === 'return') {
      estimatedHollarPerReturn =
        numberOfReturns > 0
          ? (inputs.hollarAmountPerReturn ?? 0n)
          : 0n;
    } else {
      // Match per-return amount to the DCA accumulation rate over one return
      // period. If numberOfReturns × returnPeriod exceeds totalDuration, the
      // total requested across returns will exceed the accumulated HOLLAR,
      // which the UI can detect by comparing total vs. estimatedHollarTotal.
      estimatedHollarPerReturn = calculateRateBasedHollarPerReturn(
        estimatedHollarTotal,
        inputs.returnFrequencyDays!,
        totalDurationBlocks,
      );
    }
  }

  const feeEstimate = calculateFeeEstimate(mode, numberOfReturns);

  const calculations: DcaCalculations = {
    totalTrades,
    dotPerTrade,
    estimatedHollarTotal,
    estimatedHollarPerReturn,
    totalDurationBlocks,
    sovereignAccount,
    feeEstimate,
  };

  const warnings = generateWarnings(inputs);

  return {
    inputs,
    calculations,
    validation: { valid: true, errors: [], warnings },
  };
}

/**
 * Encode the proposal call. Single-call modes return the call hex directly;
 * `both` mode wraps the two calls in `Utility.batch_all`.
 */
export async function encodeBatchCall(
  proposal: DcaProposal,
  dotPriceInUsd: number,
): Promise<string> {
  if ((proposal.inputs.origin ?? 'fellowship') === 'treasury') {
    return encodeTreasuryBatchCall(proposal, dotPriceInUsd);
  }

  const network = proposal.inputs.network;
  const collectivesApi = await getCollectivesApi(network);
  const assetHubDest = XcmVersionedLocation.V5(
    parachainLocationV5(getParachainId(network, 'ASSET_HUB')),
  );

  const mode = proposal.inputs.mode;
  type Tx = ReturnType<typeof collectivesApi.tx.PolkadotXcm.send>;

  const buildSetupTx = async (): Promise<Tx> => {
    const dotPerTrade = proposal.calculations.dotPerTrade;
    const dcaParams = calculateDcaParams(
      network,
      proposal.calculations.sovereignAccount,
      proposal.inputs.dcaFrequencyBlocks!,
      proposal.inputs.slippagePercent!,
      dotPerTrade,
      estimateHollarFromDot(dotPerTrade, dotPriceInUsd),
    );
    const dcaCallEncoded = await encodeDcaScheduleCall(network, dcaParams);
    const setupXcm = buildSetupXcm(
      network,
      proposal.inputs.dotAmount!,
      PER_HOP_FEE_PLANCK,
      dcaCallEncoded,
    );
    return collectivesApi.tx.PolkadotXcm.send({
      dest: assetHubDest,
      message: setupXcm,
    });
  };

  const buildReturnTx = (): Tx => {
    const periodicReturnParams = calculatePeriodicReturnParams(
      proposal.inputs.returnFrequencyDays!,
      proposal.inputs.numberOfReturns!,
      proposal.calculations.estimatedHollarPerReturn,
    );
    const returnXcm = buildPeriodicReturnXcm(
      network,
      periodicReturnParams.hollarAmountPerReturn,
      PER_HOP_FEE_PLANCK,
      PER_HOP_FEE_PLANCK,
      proposal.inputs.treasurySplitPercent!,
    );
    const returnSendCall = collectivesApi.tx.PolkadotXcm.send({
      dest: assetHubDest,
      message: returnXcm,
    });
    return collectivesApi.tx.Scheduler.schedule_after({
      after: periodicReturnParams.initialDelayBlocks,
      maybe_periodic: [
        periodicReturnParams.periodBlocks,
        periodicReturnParams.repetitions,
      ] as [number, number],
      priority: 128,
      call: returnSendCall.decodedCall,
    }) as Tx;
  };

  const txCalls: Tx[] = await Promise.all([
    mode !== 'return' ? buildSetupTx() : null,
    mode !== 'setup' ? buildReturnTx() : null,
  ]).then((arr) => arr.filter((tx): tx is Tx => tx !== null));

  if (txCalls.length === 1) {
    return (await txCalls[0].getEncodedData()).asHex();
  }

  const batchCall = collectivesApi.tx.Utility.batch_all({
    calls: txCalls.map((c) => c.decodedCall) as never,
  });
  return (await batchCall.getEncodedData()).asHex();
}

/**
 * Encode the treasury-origin batch for submission as an OpenGov Root referendum
 * on Asset Hub. Composition follows the derived mode:
 *   - setup / both: dispatch_as(Treasury) transfer + dispatch_as(FT) execute(setup)
 *   - both / return: Scheduler.schedule_after(dispatch_as(FT) execute(return))
 * A single resulting call is returned directly; 2+ are wrapped in Utility.batch_all.
 */
async function encodeTreasuryBatchCall(
  proposal: DcaProposal,
  dotPriceInUsd: number,
): Promise<string> {
  const network = proposal.inputs.network;
  const ahApi = await getAssetHubApi(network);
  const mode = proposal.inputs.mode;

  // pallet_xcm Origin::Xcm(FT pallet location) — Root impersonates the FT pallet
  // so the executed message needs no leading AliasOrigin.
  const ftXcmOrigin = {
    type: 'PolkadotXcm' as const,
    value: {
      type: 'Xcm' as const,
      value: fellowshipTreasuryPalletLocationV5(network),
    },
  };

  const treasurySignedOrigin = {
    type: 'system' as const,
    value: { type: 'Signed' as const, value: ACCOUNTS.MAIN_TREASURY },
  };

  const includeSpendAndSetup = mode !== 'return';
  const includeReturn = mode !== 'setup';

  // Each entry keeps the tx (for the single-call fast path) and its decodedCall
  // (for batch_all).
  const txs: Array<{
    decodedCall: unknown;
    getEncodedData: () => Promise<{ asHex: () => string }>;
  }> = [];

  if (includeSpendAndSetup) {
    // 1) Treasury spend: dispatch_as(Treasury) → transfer DOT to FT account on AH.
    const spendTx = ahApi.tx.Utility.dispatch_as({
      as_origin: treasurySignedOrigin as never,
      call: ahApi.tx.Balances.transfer_keep_alive({
        dest: MultiAddress.Id(ACCOUNTS.FELLOWSHIP_TREASURY),
        value: proposal.inputs.dotAmount! + SETUP_FEE_BUFFER_PLANCK,
      }).decodedCall,
    });
    txs.push(spendTx);

    // 2) DCA setup: dispatch_as(FT) → PolkadotXcm.execute(setup XCM, no leading alias).
    const dotPerTrade = proposal.calculations.dotPerTrade;
    const dcaParams = calculateDcaParams(
      network,
      proposal.calculations.sovereignAccount,
      proposal.inputs.dcaFrequencyBlocks!,
      proposal.inputs.slippagePercent!,
      dotPerTrade,
      estimateHollarFromDot(dotPerTrade, dotPriceInUsd),
    );
    const dcaCallEncoded = await encodeDcaScheduleCall(network, dcaParams);
    const setupXcm = buildSetupXcm(
      network,
      proposal.inputs.dotAmount!,
      PER_HOP_FEE_PLANCK,
      dcaCallEncoded,
      false,
    );
    const setupTx = ahApi.tx.Utility.dispatch_as({
      as_origin: ftXcmOrigin as never,
      call: ahApi.tx.PolkadotXcm.execute({
        message: setupXcm,
        max_weight: EXECUTE_MAX_WEIGHT,
      }).decodedCall,
    });
    txs.push(setupTx);
  }

  if (includeReturn) {
    // 3) Periodic returns: Scheduler.schedule_after(dispatch_as(FT) → execute(return)).
    const periodicReturnParams = calculatePeriodicReturnParams(
      proposal.inputs.returnFrequencyDays!,
      proposal.inputs.numberOfReturns!,
      proposal.calculations.estimatedHollarPerReturn,
    );
    const returnXcm = buildPeriodicReturnXcm(
      network,
      periodicReturnParams.hollarAmountPerReturn,
      PER_HOP_FEE_PLANCK,
      PER_HOP_FEE_PLANCK,
      proposal.inputs.treasurySplitPercent!,
      false,
    );
    const returnDispatch = ahApi.tx.Utility.dispatch_as({
      as_origin: ftXcmOrigin as never,
      call: ahApi.tx.PolkadotXcm.execute({
        message: returnXcm,
        max_weight: EXECUTE_MAX_WEIGHT,
      }).decodedCall,
    });
    const scheduledTx = ahApi.tx.Scheduler.schedule_after({
      after: periodicReturnParams.initialDelayBlocks,
      maybe_periodic: [
        periodicReturnParams.periodBlocks,
        periodicReturnParams.repetitions,
      ] as [number, number],
      priority: 128,
      call: returnDispatch.decodedCall,
    });
    txs.push(scheduledTx);
  }

  if (txs.length === 1) {
    return (await txs[0].getEncodedData()).asHex();
  }

  const batchCall = ahApi.tx.Utility.batch_all({
    calls: txs.map((t) => t.decodedCall) as never,
  });
  return (await batchCall.getEncodedData()).asHex();
}

