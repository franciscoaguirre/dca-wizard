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
import { ThemeToggle } from '../components/ThemeToggle';
import { getAssetHubClient } from '../api/clients/dotAh';
import { getHydrationClient } from '../api/clients/hydration';
import { getCollectivesClient } from '../api/clients/collectives';

export function DcaWizard() {
  const { state, dispatch, canProceedToPreview } = useWizardState();

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
    <div className="min-h-screen bg-surface-main text-primary">
      <div className="container mx-auto max-w-4xl px-4 py-6 md:py-10">
        <Navbar />

        <header className="mt-8 md:mt-12">
          <h1 className="font-display text-4xl md:text-5xl leading-tight text-primary">
            Build a DCA proposal
          </h1>
          <p className="mt-3 text-base text-secondary max-w-2xl">
            Choose an origin, configure the DCA, and set a destination — a single
            referendum that converts DOT to HOLLAR over time and returns it to the
            Fellowship.
          </p>
        </header>

        <div className="mt-10">
          <Stepper currentStep={state.currentStep} />
        </div>

        <main className="mt-8 pb-12">
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
        </main>
      </div>
    </div>
  );
}

function Navbar() {
  const base = import.meta.env.BASE_URL;
  return (
    <nav className="flex items-center justify-between bg-surface-container rounded-container px-4 py-3 md:px-5">
      <a
        href="https://polkadot.com"
        target="_blank"
        rel="noreferrer"
        aria-label="Polkadot"
        className="flex items-center"
      >
        <img
          src={`${base}logo-symbol-wordmark_dark.svg`}
          alt="Polkadot"
          className="block dark:hidden h-7 w-auto"
        />
        <img
          src={`${base}logo-symbol-wordmark_light.svg`}
          alt="Polkadot"
          className="hidden dark:block h-7 w-auto"
        />
      </a>
      <div className="flex items-center gap-2">
        <ConnectionStatusIndicator />
        <ThemeToggle />
      </div>
    </nav>
  );
}

interface StepperProps {
  currentStep: 'form' | 'preview' | 'submit';
}

function Stepper({ currentStep }: StepperProps) {
  const steps: Array<{ key: StepperProps['currentStep']; label: string }> = [
    { key: 'form', label: 'Configure' },
    { key: 'preview', label: 'Preview' },
    { key: 'submit', label: 'Submit' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center">
      {steps.map((step, idx) => {
        const completed = idx < currentIndex;
        const active = idx === currentIndex;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <StepIndicator
              step={idx + 1}
              label={step.label}
              active={active}
              completed={completed}
            />
            {idx < steps.length - 1 && (
              <div className="flex-1 h-px bg-divider mx-3 md:mx-4 relative">
                <div
                  className="absolute inset-y-0 left-0 bg-action-primary transition-all duration-300"
                  style={{ width: completed ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        );
      })}
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
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
          completed
            ? 'bg-action-primary text-primary-inverted'
            : active
              ? 'border-2 border-default-inverted text-primary'
              : 'bg-surface-nested text-tertiary'
        }`}
      >
        {completed ? <Check className="w-4 h-4" /> : step}
      </div>
      <span
        className={`text-sm font-medium hidden sm:inline ${
          active || completed ? 'text-primary' : 'text-tertiary'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
