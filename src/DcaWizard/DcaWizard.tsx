/**
 * DCA Wizard Container Component
 * Manages the multi-step wizard flow
 */

import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { useWizardState } from './use-wizard-state';
import { DcaWizardForm } from './DcaWizardForm';
import { ProposalPreview } from './ProposalPreview';
import { SubmitProposal } from './SubmitProposal';
import { ConnectionStatusIndicator } from '../components/ConnectionStatus/ConnectionStatusIndicator';
import { getAssetHubClient } from '../api/clients/dotAh';
import { getHydrationClient } from '../api/clients/hydration';
import { getCollectivesClient } from '../api/clients/collectives';

export function DcaWizard() {
  const { state, dispatch, canProceedToPreview } = useWizardState();

  // Proactively initialize light clients in background
  useEffect(() => {
    getAssetHubClient('polkadot').catch(console.error);
    getHydrationClient('polkadot').catch(console.error);
    getCollectivesClient('polkadot').catch(console.error);
  }, []);

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
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">
              DCA Wizard
            </h1>
            <p className="text-base text-neutral-600 mt-2">
              Create a Fellowship Treasury DCA proposal via the Architects track
            </p>
          </div>
          <ConnectionStatusIndicator />
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
            <div className="flex-1 h-1 bg-neutral-200 mx-4">
              <div
                className={`h-full bg-primary-500 transition-all duration-300 ${
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
            <div className="flex-1 h-1 bg-neutral-200 mx-4">
              <div
                className={`h-full bg-primary-500 transition-all duration-300 ${
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
              dotPriceUsd={state.dotPriceUsd}
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
            ? 'bg-primary-100 text-primary-900 shadow-md border-2 border-primary-600'
            : completed
            ? 'bg-success-100 text-success-900 shadow-md border-2 border-success-600'
            : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {completed ? <Check className="w-5 h-5" /> : step}
      </div>
      <span
        className={`mt-2 text-sm ${
          active
            ? 'text-neutral-900 font-bold'
            : completed
            ? 'text-neutral-800 font-semibold'
            : 'text-neutral-500 font-medium'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
