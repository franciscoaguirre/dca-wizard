/**
 * Share-via-URL serialization for the DCA wizard.
 *
 * The wizard's input parameters live in the URL as readable query params
 * (`?mode=both&dotAmount=1500&dcaFrequencyBlocks=100&...`). This makes a
 * shared link a human-inspectable record of exactly what the sender typed —
 * the companion to the opaque encoded call they also share.
 *
 * Only user-input fields are serialized; derived/transient state
 * (`dotPriceUsd`, `errors`, `touched`, `proposal`, `isBuilding`, `currentStep`)
 * is excluded. Parsing is fully tolerant: unknown or malformed params are
 * ignored and fall back to the value already in the base state.
 */

import type { NetworkType, ProposalMode } from '../api/constants';
import { calculateNumberOfReturns } from '../governance/periodic-return';
import type { WizardState } from './use-wizard-state';

const MODES: ProposalMode[] = ['setup', 'return', 'both'];
const NETWORKS: NetworkType[] = ['polkadot', 'paseo'];
const FREQUENCY_UNITS: WizardState['returnFrequencyUnit'][] = ['days', 'blocks'];

/**
 * Serialize the shareable fields of the current state into a query string
 * (without a leading `?`). Only fields relevant to the active mode are
 * emitted, keeping URLs clean. Returns `''` when there is nothing to share.
 */
export function buildSearchParams(state: WizardState): string {
  const params = new URLSearchParams();

  params.set('mode', state.mode);
  params.set('network', state.network);

  if (state.mode !== 'return') {
    if (state.dotAmount) params.set('dotAmount', state.dotAmount);
    params.set('dcaFrequencyBlocks', String(state.dcaFrequencyBlocks));
    params.set('dcaDurationDays', String(state.dcaDurationDays));
    params.set('slippagePercent', String(state.slippagePercent));
  }

  if (state.mode !== 'setup') {
    params.set('returnFrequencyDays', String(state.returnFrequencyDays));
    params.set('returnFrequencyUnit', state.returnFrequencyUnit);
    params.set('treasurySplitPercent', String(state.treasurySplitPercent));
    // In 'both' mode the count is derived from duration / frequency, so we
    // don't serialize it — it would be redundant and could drift.
    if (state.mode === 'return') {
      params.set('numberOfReturns', String(state.numberOfReturns));
    }
  }

  if (state.mode === 'return' && state.hollarAmountPerReturn) {
    params.set('hollarAmountPerReturn', state.hollarAmountPerReturn);
  }

  return params.toString();
}

/** Coerce a query value to a finite number, or `undefined` if not parseable. */
function num(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Merge query params from `search` (e.g. `window.location.search`) onto a base
 * state. Invalid or missing params keep the base value. The caller is
 * responsible for re-running validation on the result.
 */
export function applyParamsToState(search: string, base: WizardState): WizardState {
  const params = new URLSearchParams(search);
  const next: WizardState = { ...base };

  const mode = params.get('mode');
  if (mode && (MODES as string[]).includes(mode)) {
    next.mode = mode as ProposalMode;
  }

  const network = params.get('network');
  if (network && (NETWORKS as string[]).includes(network)) {
    next.network = network as NetworkType;
  }

  // String amounts are kept verbatim (decimal strings); validation happens later.
  const dotAmount = params.get('dotAmount');
  if (dotAmount !== null) next.dotAmount = dotAmount;

  const hollarAmountPerReturn = params.get('hollarAmountPerReturn');
  if (hollarAmountPerReturn !== null) next.hollarAmountPerReturn = hollarAmountPerReturn;

  const dcaFrequencyBlocks = num(params.get('dcaFrequencyBlocks'));
  if (dcaFrequencyBlocks !== undefined) next.dcaFrequencyBlocks = dcaFrequencyBlocks;

  const dcaDurationDays = num(params.get('dcaDurationDays'));
  if (dcaDurationDays !== undefined) next.dcaDurationDays = dcaDurationDays;

  const slippagePercent = num(params.get('slippagePercent'));
  if (slippagePercent !== undefined) next.slippagePercent = slippagePercent;

  const returnFrequencyDays = num(params.get('returnFrequencyDays'));
  if (returnFrequencyDays !== undefined) next.returnFrequencyDays = returnFrequencyDays;

  const returnFrequencyUnit = params.get('returnFrequencyUnit');
  if (returnFrequencyUnit && (FREQUENCY_UNITS as string[]).includes(returnFrequencyUnit)) {
    next.returnFrequencyUnit = returnFrequencyUnit as WizardState['returnFrequencyUnit'];
  }

  const treasurySplitPercent = num(params.get('treasurySplitPercent'));
  if (treasurySplitPercent !== undefined) next.treasurySplitPercent = treasurySplitPercent;

  if (next.mode === 'return') {
    const numberOfReturns = num(params.get('numberOfReturns'));
    if (numberOfReturns !== undefined) next.numberOfReturns = numberOfReturns;
  } else {
    // Keep 'both'/'setup' internally consistent regardless of the URL.
    next.numberOfReturns = calculateNumberOfReturns(
      next.dcaDurationDays,
      next.returnFrequencyDays,
    );
  }

  return next;
}
