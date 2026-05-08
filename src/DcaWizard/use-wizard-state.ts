/**
 * DCA Wizard State Management
 * Uses useReducer to manage form state and validation across three ProposalMode
 * flows: setup / return / both.
 */

import { useReducer, useEffect } from 'react';
import type { NetworkType, ProposalMode } from '../api/constants';
import type { DcaWizardInputs, DcaProposal } from '../governance/builder';
import {
  DEFAULTS,
  VALIDATION,
  parseDotAmount,
  parseHollarAmount,
} from '../api/constants';
import {
  buildDcaProposal,
} from '../governance/builder';
import { calculateNumberOfReturns } from '../governance/periodic-return';

/**
 * Form State
 */
export interface WizardState {
  network: NetworkType;
  mode: ProposalMode;

  // Setup-mode inputs (stringified for controlled inputs)
  dotAmount: string;
  dcaFrequencyBlocks: number;
  dcaDurationDays: number;
  slippagePercent: number;

  // Return-mode inputs
  hollarAmountPerReturn: string;      // user-entered for return-only mode
  returnFrequencyDays: number;
  returnFrequencyUnit: 'days' | 'blocks'; // testing toggle: enter frequency in raw blocks
  numberOfReturns: number;
  treasurySplitPercent: number;

  // DOT price (from oracle/API)
  dotPriceUsd: number;

  // Validation
  errors: Record<string, string>;
  touched: Record<string, boolean>;

  // Proposal
  proposal: DcaProposal | null;
  isBuilding: boolean;

  // UI state
  currentStep: 'form' | 'preview' | 'submit';
}

/**
 * State Actions
 */
export type WizardAction =
  | { type: 'SET_MODE'; payload: ProposalMode }
  | { type: 'SET_DOT_AMOUNT'; payload: string }
  | { type: 'SET_HOLLAR_PER_RETURN'; payload: string }
  | { type: 'SET_DCA_FREQUENCY'; payload: number }
  | { type: 'SET_DCA_DURATION'; payload: number }
  | { type: 'SET_SLIPPAGE'; payload: number }
  | { type: 'SET_RETURN_FREQUENCY'; payload: number }
  | { type: 'SET_RETURN_FREQUENCY_UNIT'; payload: 'days' | 'blocks' }
  | { type: 'SET_NUMBER_OF_RETURNS'; payload: number }
  | { type: 'SET_TREASURY_SPLIT'; payload: number }
  | { type: 'SET_DOT_PRICE'; payload: number }
  | { type: 'SET_FIELD_TOUCHED'; payload: string }
  | { type: 'BUILD_PROPOSAL_START' }
  | { type: 'BUILD_PROPOSAL_SUCCESS'; payload: DcaProposal }
  | { type: 'BUILD_PROPOSAL_ERROR'; payload: string }
  | { type: 'GO_TO_STEP'; payload: 'form' | 'preview' | 'submit' }
  | { type: 'RESET' };

/**
 * Initial State
 */
const initialState: WizardState = {
  network: 'polkadot',
  mode: 'both',
  dotAmount: '',
  hollarAmountPerReturn: '',
  dcaFrequencyBlocks: DEFAULTS.DCA_FREQUENCY_BLOCKS,
  dcaDurationDays: DEFAULTS.DCA_DURATION_DAYS,
  slippagePercent: DEFAULTS.SLIPPAGE_PERCENT,
  returnFrequencyDays: DEFAULTS.RETURN_FREQUENCY_DAYS,
  returnFrequencyUnit: 'days',
  numberOfReturns: DEFAULTS.NUMBER_OF_RETURNS,
  treasurySplitPercent: DEFAULTS.TREASURY_SPLIT_PERCENT,
  dotPriceUsd: 5.0,
  errors: {},
  touched: {},
  proposal: null,
  isBuilding: false,
  currentStep: 'form',
};

type ValidatableField =
  | 'dotAmount'
  | 'hollarAmountPerReturn'
  | 'dcaFrequencyBlocks'
  | 'dcaDurationDays'
  | 'slippagePercent'
  | 'numberOfReturns'
  | 'treasurySplitPercent';

function getFieldValue(state: WizardState, field: ValidatableField): WizardState[ValidatableField] {
  return state[field];
}

/**
 * Validate individual field. Some fields are only relevant in certain modes —
 * return null for fields not applicable to the current mode.
 */
function validateField(field: string, value: WizardState[ValidatableField], state: WizardState): string | null {
  switch (field) {
    case 'dotAmount': {
      if (state.mode === 'return') return null;
      const strValue = value as string;
      if (!strValue || strValue === '') {
        return 'DOT amount is required';
      }
      try {
        const amount = parseDotAmount(strValue);
        if (amount <= 0n) {
          return 'DOT amount must be greater than 0';
        }
        if (amount < VALIDATION.MIN_DOT_AMOUNT) {
          return `Minimum DOT amount is ${Number(VALIDATION.MIN_DOT_AMOUNT) / 1e10} DOT`;
        }
      } catch {
        return 'Invalid DOT amount format';
      }
      return null;
    }

    case 'hollarAmountPerReturn': {
      if (state.mode !== 'return') return null;
      const strValue = value as string;
      if (!strValue || strValue === '') {
        return 'HOLLAR per return is required';
      }
      try {
        const amount = parseHollarAmount(strValue);
        if (amount <= 0n) {
          return 'HOLLAR per return must be greater than 0';
        }
      } catch {
        return 'Invalid HOLLAR amount format';
      }
      return null;
    }

    case 'dcaFrequencyBlocks': {
      if (state.mode === 'return') return null;
      const numValue = value as number;
      if (numValue < VALIDATION.MIN_DCA_FREQUENCY_BLOCKS) {
        return `Minimum DCA frequency is ${VALIDATION.MIN_DCA_FREQUENCY_BLOCKS} blocks`;
      }
      return null;
    }

    case 'dcaDurationDays': {
      if (state.mode === 'return') return null;
      const numValue = value as number;
      if (numValue <= 0) {
        return 'DCA duration must be greater than 0 days';
      }
      return null;
    }

    case 'slippagePercent': {
      if (state.mode === 'return') return null;
      const numValue = value as number;
      if (numValue < 0.1 || numValue > 10) {
        return 'Slippage must be between 0.1% and 10%';
      }
      return null;
    }

    case 'numberOfReturns': {
      // In 'both' mode the count is auto-derived from duration / frequency, so
      // it doesn't need a UI cap. 'return' mode is user-input → validate.
      if (state.mode !== 'return') return null;
      const numValue = value as number;
      if (numValue < VALIDATION.MIN_RETURNS || numValue > VALIDATION.MAX_RETURNS) {
        return `Number of returns must be between ${VALIDATION.MIN_RETURNS} and ${VALIDATION.MAX_RETURNS}`;
      }
      return null;
    }

    case 'treasurySplitPercent': {
      if (state.mode === 'setup') return null;
      const numValue = value as number;
      if (numValue < 0 || numValue > 100) {
        return 'Treasury split must be between 0 and 100';
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Validate all fields for the current mode.
 */
function validateAllFields(state: WizardState): Record<string, string> {
  const errors: Record<string, string> = {};

  const fields: ValidatableField[] = [
    'dotAmount',
    'hollarAmountPerReturn',
    'dcaFrequencyBlocks',
    'dcaDurationDays',
    'slippagePercent',
    'numberOfReturns',
    'treasurySplitPercent',
  ];

  for (const field of fields) {
    const error = validateField(field, getFieldValue(state, field), state);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}

function updateFieldWithValidation<K extends ValidatableField>(
  state: WizardState,
  field: K,
  value: WizardState[K]
): WizardState {
  const nextState = { ...state, [field]: value };
  const error = validateField(field, value, nextState);
  const { [field]: _, ...restErrors } = state.errors;
  return {
    ...nextState,
    errors: error ? { ...restErrors, [field]: error } : restErrors,
  };
}

/**
 * Reducer
 */
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_MODE': {
      // Re-validate all fields under the new mode.
      const nextState = { ...state, mode: action.payload };
      return { ...nextState, errors: validateAllFields(nextState) };
    }

    case 'SET_DOT_AMOUNT':
      return updateFieldWithValidation(state, 'dotAmount', action.payload);

    case 'SET_HOLLAR_PER_RETURN':
      return updateFieldWithValidation(state, 'hollarAmountPerReturn', action.payload);

    case 'SET_DCA_FREQUENCY':
      return updateFieldWithValidation(state, 'dcaFrequencyBlocks', action.payload);

    case 'SET_DCA_DURATION': {
      const newState = updateFieldWithValidation(state, 'dcaDurationDays', action.payload);
      // Auto-calc returns only relevant when DCA is part of the batch.
      if (state.mode !== 'return') {
        const numberOfReturns = calculateNumberOfReturns(action.payload, newState.returnFrequencyDays);
        return { ...newState, numberOfReturns };
      }
      return newState;
    }

    case 'SET_SLIPPAGE':
      return updateFieldWithValidation(state, 'slippagePercent', action.payload);

    case 'SET_RETURN_FREQUENCY': {
      // In 'both' mode, the count is fully derived from duration / frequency;
      // 'return' mode keeps the manual count knob.
      if (state.mode !== 'return') {
        const numberOfReturns = calculateNumberOfReturns(state.dcaDurationDays, action.payload);
        return { ...state, returnFrequencyDays: action.payload, numberOfReturns };
      }
      return { ...state, returnFrequencyDays: action.payload };
    }

    case 'SET_RETURN_FREQUENCY_UNIT':
      return { ...state, returnFrequencyUnit: action.payload };

    case 'SET_NUMBER_OF_RETURNS':
      return updateFieldWithValidation(state, 'numberOfReturns', action.payload);

    case 'SET_TREASURY_SPLIT':
      return updateFieldWithValidation(state, 'treasurySplitPercent', action.payload);

    case 'SET_DOT_PRICE':
      if (state.dotPriceUsd === action.payload) return state;
      return { ...state, dotPriceUsd: action.payload };

    case 'SET_FIELD_TOUCHED':
      return {
        ...state,
        touched: { ...state.touched, [action.payload]: true },
      };

    case 'BUILD_PROPOSAL_START':
      return { ...state, isBuilding: true };

    case 'BUILD_PROPOSAL_SUCCESS':
      return {
        ...state,
        proposal: action.payload,
        isBuilding: false,
      };

    case 'BUILD_PROPOSAL_ERROR':
      return {
        ...state,
        errors: { ...state.errors, general: action.payload },
        isBuilding: false,
      };

    case 'GO_TO_STEP':
      return { ...state, currentStep: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Hook
 */
export function useWizardState() {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  // Auto-build proposal when inputs change (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Only build if we have valid inputs for the current mode.
      const errors = validateAllFields(state);
      if (Object.keys(errors).length > 0) {
        return;
      }

      // Gate: per-mode, ensure required inputs are non-empty.
      if (state.mode !== 'return' && !state.dotAmount) return;
      if (state.mode === 'return' && !state.hollarAmountPerReturn) return;

      try {
        dispatch({ type: 'BUILD_PROPOSAL_START' });

        const inputs: DcaWizardInputs = {
          network: state.network,
          mode: state.mode,
          dotAmount: state.mode !== 'return' ? parseDotAmount(state.dotAmount) : undefined,
          dcaFrequencyBlocks: state.mode !== 'return' ? state.dcaFrequencyBlocks : undefined,
          dcaDurationDays: state.mode !== 'return' ? state.dcaDurationDays : undefined,
          slippagePercent: state.mode !== 'return' ? state.slippagePercent : undefined,
          hollarAmountPerReturn:
            state.mode === 'return' ? parseHollarAmount(state.hollarAmountPerReturn) : undefined,
          returnFrequencyDays: state.mode !== 'setup' ? state.returnFrequencyDays : undefined,
          numberOfReturns: state.mode !== 'setup' ? state.numberOfReturns : undefined,
          treasurySplitPercent: state.mode !== 'setup' ? state.treasurySplitPercent : undefined,
          salarySplitPercent: state.mode !== 'setup' ? 100 - state.treasurySplitPercent : undefined,
        };

        const proposal = await buildDcaProposal(inputs, state.dotPriceUsd);
        dispatch({ type: 'BUILD_PROPOSAL_SUCCESS', payload: proposal });
      } catch (error) {
        dispatch({
          type: 'BUILD_PROPOSAL_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to build proposal',
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    state.mode,
    state.dotAmount,
    state.hollarAmountPerReturn,
    state.dcaFrequencyBlocks,
    state.dcaDurationDays,
    state.slippagePercent,
    state.returnFrequencyDays,
    state.numberOfReturns,
    state.treasurySplitPercent,
    state.dotPriceUsd,
  ]);

  // Derived values
  const hasRequiredInput =
    state.mode === 'return' ? !!state.hollarAmountPerReturn : !!state.dotAmount;
  const isFormValid = Object.keys(state.errors).length === 0 && hasRequiredInput;
  const canProceedToPreview = isFormValid && state.proposal !== null && !state.isBuilding;

  return {
    state,
    dispatch,
    isFormValid,
    canProceedToPreview,
  };
}
