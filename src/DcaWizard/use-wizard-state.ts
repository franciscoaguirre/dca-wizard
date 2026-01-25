/**
 * DCA Wizard State Management
 * Uses useReducer to manage form state and validation
 */

import { useReducer, useEffect } from 'react';
import type { NetworkType, StablecoinType } from '../api/constants';
import type { DcaWizardInputs, DcaProposal } from '../governance/builder';
import {
  DEFAULTS,
  VALIDATION,
  parseDotAmount,
} from '../api/constants';
import {
  buildDcaProposal,
} from '../governance/builder';

/**
 * Form State
 */
export interface WizardState {
  // Network selection
  network: NetworkType;

  // Input values (as strings for controlled inputs)
  dotAmount: string;
  stablecoin: StablecoinType;
  dcaFrequencyBlocks: number;
  dcaDurationDays: number;
  slippagePercent: number;
  returnFrequencyDays: number;
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
  | { type: 'SET_DOT_AMOUNT'; payload: string }
  | { type: 'SET_STABLECOIN'; payload: StablecoinType }
  | { type: 'SET_DCA_FREQUENCY'; payload: number }
  | { type: 'SET_DCA_DURATION'; payload: number }
  | { type: 'SET_SLIPPAGE'; payload: number }
  | { type: 'SET_RETURN_FREQUENCY'; payload: number }
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
  dotAmount: '',
  stablecoin: 'USDT',
  dcaFrequencyBlocks: DEFAULTS.DCA_FREQUENCY_BLOCKS,
  dcaDurationDays: DEFAULTS.DCA_DURATION_DAYS,
  slippagePercent: DEFAULTS.SLIPPAGE_PERCENT,
  returnFrequencyDays: DEFAULTS.RETURN_FREQUENCY_DAYS,
  numberOfReturns: DEFAULTS.NUMBER_OF_RETURNS,
  treasurySplitPercent: DEFAULTS.TREASURY_SPLIT_PERCENT,
  dotPriceUsd: 5.0, // Default, should be fetched from API
  errors: {},
  touched: {},
  proposal: null,
  isBuilding: false,
  currentStep: 'form',
};

/**
 * Type-safe field accessor for WizardState
 */
type ValidatableField = 'dotAmount' | 'dcaFrequencyBlocks' | 'dcaDurationDays' | 'slippagePercent' | 'numberOfReturns' | 'treasurySplitPercent';

function getFieldValue(state: WizardState, field: ValidatableField): WizardState[ValidatableField] {
  return state[field];
}

/**
 * Validate individual field
 */
function validateField(field: string, value: WizardState[ValidatableField], _state: WizardState): string | null {
  switch (field) {
    case 'dotAmount': {
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

    case 'dcaFrequencyBlocks': {
      const numValue = value as number;
      if (numValue < VALIDATION.MIN_DCA_FREQUENCY_BLOCKS) {
        return `Minimum DCA frequency is ${VALIDATION.MIN_DCA_FREQUENCY_BLOCKS} blocks`;
      }
      return null;
    }

    case 'dcaDurationDays': {
      const numValue = value as number;
      if (numValue <= 0) {
        return 'DCA duration must be greater than 0 days';
      }
      return null;
    }

    case 'slippagePercent': {
      const numValue = value as number;
      if (numValue < 0.1 || numValue > 10) {
        return 'Slippage must be between 0.1% and 10%';
      }
      return null;
    }

    case 'numberOfReturns': {
      const numValue = value as number;
      if (numValue < VALIDATION.MIN_RETURNS || numValue > VALIDATION.MAX_RETURNS) {
        return `Number of returns must be between ${VALIDATION.MIN_RETURNS} and ${VALIDATION.MAX_RETURNS}`;
      }
      return null;
    }

    case 'treasurySplitPercent': {
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
 * Validate all fields
 */
function validateAllFields(state: WizardState): Record<string, string> {
  const errors: Record<string, string> = {};

  const fields: ValidatableField[] = [
    'dotAmount',
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

/**
 * Helper to update a field with validation
 */
function updateFieldWithValidation<K extends ValidatableField>(
  state: WizardState,
  field: K,
  value: WizardState[K]
): WizardState {
  const error = validateField(field, value, state);
  const { [field]: _, ...restErrors } = state.errors;
  return {
    ...state,
    [field]: value,
    errors: error ? { ...restErrors, [field]: error } : restErrors,
  };
}

/**
 * Calculate number of returns needed to cover the DCA duration
 */
function calculateNumberOfReturns(durationDays: number, returnFrequencyDays: number): number {
  return Math.ceil(durationDays / returnFrequencyDays);
}

/**
 * Reducer
 */
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_DOT_AMOUNT':
      return updateFieldWithValidation(state, 'dotAmount', action.payload);

    case 'SET_STABLECOIN':
      return { ...state, stablecoin: action.payload };

    case 'SET_DCA_FREQUENCY':
      return updateFieldWithValidation(state, 'dcaFrequencyBlocks', action.payload);

    case 'SET_DCA_DURATION': {
      const newState = updateFieldWithValidation(state, 'dcaDurationDays', action.payload);
      // Auto-calculate number of returns to cover the full duration
      const numberOfReturns = calculateNumberOfReturns(action.payload, newState.returnFrequencyDays);
      return { ...newState, numberOfReturns };
    }

    case 'SET_SLIPPAGE':
      return updateFieldWithValidation(state, 'slippagePercent', action.payload);

    case 'SET_RETURN_FREQUENCY': {
      // Auto-calculate number of returns when frequency changes
      const numberOfReturns = calculateNumberOfReturns(state.dcaDurationDays, action.payload);
      return { ...state, returnFrequencyDays: action.payload, numberOfReturns };
    }

    case 'SET_NUMBER_OF_RETURNS':
      return updateFieldWithValidation(state, 'numberOfReturns', action.payload);

    case 'SET_TREASURY_SPLIT':
      return updateFieldWithValidation(state, 'treasurySplitPercent', action.payload);

    case 'SET_DOT_PRICE':
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
      // Only build if we have valid inputs
      const errors = validateAllFields(state);
      if (Object.keys(errors).length > 0) {
        return;
      }

      if (!state.dotAmount) {
        return;
      }

      try {
        dispatch({ type: 'BUILD_PROPOSAL_START' });

        const inputs: DcaWizardInputs = {
          network: state.network,
          dotAmount: parseDotAmount(state.dotAmount),
          stablecoin: state.stablecoin,
          dcaFrequencyBlocks: state.dcaFrequencyBlocks,
          dcaDurationDays: state.dcaDurationDays,
          slippagePercent: state.slippagePercent,
          returnFrequencyDays: state.returnFrequencyDays,
          numberOfReturns: state.numberOfReturns,
          treasurySplitPercent: state.treasurySplitPercent,
          salarySplitPercent: 100 - state.treasurySplitPercent,
        };

        const proposal = await buildDcaProposal(inputs, state.dotPriceUsd);
        dispatch({ type: 'BUILD_PROPOSAL_SUCCESS', payload: proposal });
      } catch (error) {
        dispatch({
          type: 'BUILD_PROPOSAL_ERROR',
          payload: error instanceof Error ? error.message : 'Failed to build proposal',
        });
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [
    state.dotAmount,
    state.stablecoin,
    state.dcaFrequencyBlocks,
    state.dcaDurationDays,
    state.slippagePercent,
    state.returnFrequencyDays,
    state.numberOfReturns,
    state.treasurySplitPercent,
    state.dotPriceUsd,
  ]);

  // Derived values
  const isFormValid = Object.keys(state.errors).length === 0 && !!state.dotAmount;
  const canProceedToPreview = isFormValid && state.proposal !== null && !state.isBuilding;

  return {
    state,
    dispatch,
    isFormValid,
    canProceedToPreview,
  };
}
