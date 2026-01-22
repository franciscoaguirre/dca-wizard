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
  salarySplitPercent: number;

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
  | { type: 'SET_NETWORK'; payload: NetworkType }
  | { type: 'SET_DOT_AMOUNT'; payload: string }
  | { type: 'SET_STABLECOIN'; payload: StablecoinType }
  | { type: 'SET_DCA_FREQUENCY'; payload: number }
  | { type: 'SET_DCA_DURATION'; payload: number }
  | { type: 'SET_SLIPPAGE'; payload: number }
  | { type: 'SET_RETURN_FREQUENCY'; payload: number }
  | { type: 'SET_NUMBER_OF_RETURNS'; payload: number }
  | { type: 'SET_TREASURY_SPLIT'; payload: number }
  | { type: 'SET_SALARY_SPLIT'; payload: number }
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
  salarySplitPercent: DEFAULTS.SALARY_SPLIT_PERCENT,
  dotPriceUsd: 5.0, // Default, should be fetched from API
  errors: {},
  touched: {},
  proposal: null,
  isBuilding: false,
  currentStep: 'form',
};

/**
 * Validate individual field
 */
function validateField(field: string, value: any, state: WizardState): string | null {
  switch (field) {
    case 'dotAmount':
      if (!value || value === '') {
        return 'DOT amount is required';
      }
      try {
        const amount = parseDotAmount(value);
        if (amount <= 0n) {
          return 'DOT amount must be greater than 0';
        }
        if (amount < VALIDATION.MIN_DOT_AMOUNT) {
          return `Minimum DOT amount is ${Number(VALIDATION.MIN_DOT_AMOUNT) / 1e10} DOT`;
        }
      } catch (e) {
        return 'Invalid DOT amount format';
      }
      return null;

    case 'dcaFrequencyBlocks':
      if (value < VALIDATION.MIN_DCA_FREQUENCY_BLOCKS) {
        return `Minimum DCA frequency is ${VALIDATION.MIN_DCA_FREQUENCY_BLOCKS} blocks`;
      }
      return null;

    case 'dcaDurationDays':
      if (value <= 0) {
        return 'DCA duration must be greater than 0 days';
      }
      return null;

    case 'slippagePercent':
      if (value < 0.1 || value > 10) {
        return 'Slippage must be between 0.1% and 10%';
      }
      return null;

    case 'numberOfReturns':
      if (value < VALIDATION.MIN_RETURNS || value > VALIDATION.MAX_RETURNS) {
        return `Number of returns must be between ${VALIDATION.MIN_RETURNS} and ${VALIDATION.MAX_RETURNS}`;
      }
      return null;

    case 'treasurySplitPercent':
    case 'salarySplitPercent':
      const treasuryPercent = field === 'treasurySplitPercent' ? value : state.treasurySplitPercent;
      const salaryPercent = field === 'salarySplitPercent' ? value : state.salarySplitPercent;
      if (treasuryPercent + salaryPercent !== 100) {
        return 'Treasury and salary percentages must sum to 100';
      }
      return null;

    default:
      return null;
  }
}

/**
 * Validate all fields
 */
function validateAllFields(state: WizardState): Record<string, string> {
  const errors: Record<string, string> = {};

  const fields = [
    'dotAmount',
    'dcaFrequencyBlocks',
    'dcaDurationDays',
    'slippagePercent',
    'numberOfReturns',
    'treasurySplitPercent',
  ];

  for (const field of fields) {
    const error = validateField(field, (state as any)[field], state);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}

/**
 * Reducer
 */
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_NETWORK':
      return { ...state, network: action.payload };

    case 'SET_DOT_AMOUNT':
      const dotError = validateField('dotAmount', action.payload, state);
      const { dotAmount: _oldDotError, ...restErrorsAfterDot } = state.errors;
      return {
        ...state,
        dotAmount: action.payload,
        errors: dotError ? { ...restErrorsAfterDot, dotAmount: dotError } : restErrorsAfterDot,
      };

    case 'SET_STABLECOIN':
      return { ...state, stablecoin: action.payload };

    case 'SET_DCA_FREQUENCY':
      const freqError = validateField('dcaFrequencyBlocks', action.payload, state);
      const { dcaFrequencyBlocks: _oldFreqError, ...restErrorsAfterFreq } = state.errors;
      return {
        ...state,
        dcaFrequencyBlocks: action.payload,
        errors: freqError ? { ...restErrorsAfterFreq, dcaFrequencyBlocks: freqError } : restErrorsAfterFreq,
      };

    case 'SET_DCA_DURATION':
      const durationError = validateField('dcaDurationDays', action.payload, state);
      const { dcaDurationDays: _oldDurationError, ...restErrorsAfterDuration } = state.errors;
      return {
        ...state,
        dcaDurationDays: action.payload,
        errors: durationError ? { ...restErrorsAfterDuration, dcaDurationDays: durationError } : restErrorsAfterDuration,
      };

    case 'SET_SLIPPAGE':
      const slippageError = validateField('slippagePercent', action.payload, state);
      const { slippagePercent: _oldSlippageError, ...restErrorsAfterSlippage } = state.errors;
      return {
        ...state,
        slippagePercent: action.payload,
        errors: slippageError ? { ...restErrorsAfterSlippage, slippagePercent: slippageError } : restErrorsAfterSlippage,
      };

    case 'SET_RETURN_FREQUENCY':
      return { ...state, returnFrequencyDays: action.payload };

    case 'SET_NUMBER_OF_RETURNS':
      const returnsError = validateField('numberOfReturns', action.payload, state);
      const { numberOfReturns: _oldReturnsError, ...restErrorsAfterReturns } = state.errors;
      return {
        ...state,
        numberOfReturns: action.payload,
        errors: returnsError ? { ...restErrorsAfterReturns, numberOfReturns: returnsError } : restErrorsAfterReturns,
      };

    case 'SET_TREASURY_SPLIT':
      const treasuryError = validateField('treasurySplitPercent', action.payload, state);
      const { treasurySplitPercent: _oldTreasuryError, ...restErrorsAfterTreasury } = state.errors;
      return {
        ...state,
        treasurySplitPercent: action.payload,
        salarySplitPercent: 100 - action.payload,
        errors: treasuryError ? { ...restErrorsAfterTreasury, treasurySplitPercent: treasuryError } : restErrorsAfterTreasury,
      };

    case 'SET_SALARY_SPLIT':
      const salaryError = validateField('salarySplitPercent', action.payload, state);
      const { salarySplitPercent: _oldSalaryError, ...restErrorsAfterSalary } = state.errors;
      return {
        ...state,
        salarySplitPercent: action.payload,
        treasurySplitPercent: 100 - action.payload,
        errors: salaryError ? { ...restErrorsAfterSalary, salarySplitPercent: salaryError } : restErrorsAfterSalary,
      };

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
          salarySplitPercent: state.salarySplitPercent,
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
    state.network,
    state.dotAmount,
    state.stablecoin,
    state.dcaFrequencyBlocks,
    state.dcaDurationDays,
    state.slippagePercent,
    state.returnFrequencyDays,
    state.numberOfReturns,
    state.treasurySplitPercent,
    state.salarySplitPercent,
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
