/**
 * DCA Wizard Container Component
 * Manages the multi-step wizard flow
 */

import { useWizardState } from './use-wizard-state';
import { DcaWizardForm } from './DcaWizardForm';
import { ProposalPreview } from './ProposalPreview';
import { SubmitProposal } from './SubmitProposal';

export function DcaWizard() {
  const { state, dispatch, canProceedToPreview } = useWizardState();

  const handleNext = () => {
    if (state.currentStep === 'form' && canProceedToPreview) {
      dispatch({ type: 'GO_TO_STEP', payload: 'preview' });
    } else if (state.currentStep === 'preview') {
      dispatch({ type: 'GO_TO_STEP', payload: 'submit' });
    }
  };

  const handleBack = () => {
    if (state.currentStep === 'preview') {
      dispatch({ type: 'GO_TO_STEP', payload: 'form' });
    } else if (state.currentStep === 'submit') {
      dispatch({ type: 'GO_TO_STEP', payload: 'preview' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            DCA Wizard
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">
            Create a governance proposal for Dollar Cost Averaging treasury operations
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <StepIndicator
              step={1}
              label="Configure"
              active={state.currentStep === 'form'}
              completed={state.currentStep !== 'form'}
            />
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 mx-4">
              <div
                className={`h-full bg-blue-600 transition-all duration-300 ${
                  state.currentStep === 'form' ? 'w-0' : 'w-full'
                }`}
              />
            </div>
            <StepIndicator
              step={2}
              label="Preview"
              active={state.currentStep === 'preview'}
              completed={state.currentStep === 'submit'}
            />
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 mx-4">
              <div
                className={`h-full bg-blue-600 transition-all duration-300 ${
                  state.currentStep === 'submit' ? 'w-full' : 'w-0'
                }`}
              />
            </div>
            <StepIndicator
              step={3}
              label="Submit"
              active={state.currentStep === 'submit'}
              completed={false}
            />
          </div>
        </div>

        {/* Content */}
        <div className="pb-8">
          {state.currentStep === 'form' && (
            <DcaWizardForm state={state} dispatch={dispatch} onNext={handleNext} />
          )}

          {state.currentStep === 'preview' && state.proposal && (
            <ProposalPreview
              proposal={state.proposal}
              onBack={handleBack}
              onNext={handleNext}
            />
          )}

          {state.currentStep === 'submit' && state.proposal && (
            <SubmitProposal proposal={state.proposal} onBack={handleBack} />
          )}
        </div>
      </div>
    </div>
  );
}

interface StepIndicatorProps {
  step: number;
  label: string;
  active: boolean;
  completed: boolean;
}

function StepIndicator({ step, label, active, completed }: StepIndicatorProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
          active
            ? 'bg-blue-600 text-white'
            : completed
            ? 'bg-green-600 text-white'
            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        }`}
      >
        {completed ? '✓' : step}
      </div>
      <span
        className={`mt-2 text-sm font-medium ${
          active
            ? 'text-blue-600'
            : completed
            ? 'text-green-600'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
