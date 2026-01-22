/**
 * DCA Wizard Form Component
 * Main form for configuring DCA parameters
 */

import type { WizardState, WizardAction } from './use-wizard-state';
import type { StablecoinType } from '../api/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

interface DcaWizardFormProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
}

export function DcaWizardForm({ state, dispatch, onNext }: DcaWizardFormProps) {
  const hasErrors = Object.keys(state.errors).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasErrors && state.proposal) {
      onNext();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configure DCA Settings</CardTitle>
          <CardDescription>
            Set up your Dollar Cost Averaging proposal parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Network & Amount Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-800">Network & Amount</h2>

            <div className="space-y-2">
              <Label htmlFor="network">Network</Label>
              <Select
                id="network"
                value={state.network}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_NETWORK',
                    payload: e.target.value as 'polkadot' | 'paseo',
                  })
                }
              >
                <option value="polkadot">Polkadot Mainnet</option>
                <option value="paseo">Paseo Testnet</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dotAmount">DOT Amount</Label>
              <Input
                id="dotAmount"
                type="text"
                placeholder="1000"
                value={state.dotAmount}
                onChange={(e) =>
                  dispatch({ type: 'SET_DOT_AMOUNT', payload: e.target.value })
                }
                onBlur={() =>
                  dispatch({ type: 'SET_FIELD_TOUCHED', payload: 'dotAmount' })
                }
              />
              {state.touched.dotAmount && state.errors.dotAmount && (
                <p className="text-sm text-error-500 mt-1">{state.errors.dotAmount}</p>
              )}
              <p className="text-sm text-neutral-500">
                Minimum: 100 DOT. This amount will be sent from the treasury to Hydration.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stablecoin">Target Stablecoin</Label>
              <Select
                id="stablecoin"
                value={state.stablecoin}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_STABLECOIN',
                    payload: e.target.value as StablecoinType,
                  })
                }
              >
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="BOTH">Both (50/50 split)</option>
              </Select>
              <p className="text-sm text-neutral-500">
                Choose which stablecoin(s) to accumulate
              </p>
            </div>
          </section>

          <div className="border-t border-neutral-200" />

          {/* DCA Configuration Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-800">DCA Configuration</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dcaFrequency">Trade Frequency (blocks)</Label>
                <Input
                  id="dcaFrequency"
                  type="number"
                  min="10"
                  value={state.dcaFrequencyBlocks}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_DCA_FREQUENCY',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
                {state.errors.dcaFrequencyBlocks && (
                  <p className="text-sm text-error-500 mt-1">
                    {state.errors.dcaFrequencyBlocks}
                  </p>
                )}
                <p className="text-sm text-neutral-500">
                  ~{Math.round((state.dcaFrequencyBlocks * 6) / 60)} minutes
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dcaDuration">DCA Duration (days)</Label>
                <Input
                  id="dcaDuration"
                  type="number"
                  min="1"
                  value={state.dcaDurationDays}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_DCA_DURATION',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
                {state.errors.dcaDurationDays && (
                  <p className="text-sm text-error-500 mt-1">
                    {state.errors.dcaDurationDays}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slippage">Slippage Tolerance (%)</Label>
              <Input
                id="slippage"
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={state.slippagePercent}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SLIPPAGE',
                    payload: parseFloat(e.target.value),
                  })
                }
              />
              {state.errors.slippagePercent && (
                <p className="text-sm text-error-500 mt-1">{state.errors.slippagePercent}</p>
              )}
              <p className="text-sm text-neutral-500">
                Maximum price slippage acceptable per trade (0.1% - 10%)
              </p>
            </div>

            {state.proposal && (
              <div className="pt-4 border-t border-neutral-200">
                <p className="text-sm font-medium text-neutral-700">Calculated Values:</p>
                <ul className="text-sm text-neutral-600 space-y-1 mt-2">
                  <li>
                    Total Trades: {state.proposal.calculations.totalTrades}
                  </li>
                  <li>
                    DOT per Trade:{' '}
                    {(
                      Number(state.proposal.calculations.dotPerTrade) / 1e10
                    ).toFixed(4)}{' '}
                    DOT
                  </li>
                </ul>
              </div>
            )}
          </section>

          <div className="border-t border-neutral-200" />

          {/* Return Settings Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-800">Return Settings</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="returnFrequency">Return Frequency (days)</Label>
                <Input
                  id="returnFrequency"
                  type="number"
                  min="1"
                  value={state.returnFrequencyDays}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_RETURN_FREQUENCY',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
                <p className="text-sm text-neutral-500">
                  How often to return stablecoins to Asset Hub
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="numberOfReturns">Number of Returns</Label>
                <Input
                  id="numberOfReturns"
                  type="number"
                  min="1"
                  max="365"
                  value={state.numberOfReturns}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_NUMBER_OF_RETURNS',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
                {state.errors.numberOfReturns && (
                  <p className="text-sm text-error-500 mt-1">
                    {state.errors.numberOfReturns}
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className="border-t border-neutral-200" />

          {/* Beneficiary Split Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-neutral-800">Beneficiary Split</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="treasurySplit">Fellowship Treasury (%)</Label>
                <Input
                  id="treasurySplit"
                  type="number"
                  min="0"
                  max="100"
                  value={state.treasurySplitPercent}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_TREASURY_SPLIT',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="salarySplit">Fellowship Salary (%)</Label>
                <Input
                  id="salarySplit"
                  type="number"
                  min="0"
                  max="100"
                  value={state.salarySplitPercent}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_SALARY_SPLIT',
                      payload: parseInt(e.target.value, 10),
                    })
                  }
                />
              </div>
            </div>
            {state.errors.treasurySplitPercent && (
              <p className="text-sm text-error-500 mt-1">
                {state.errors.treasurySplitPercent}
              </p>
            )}
            <p className="text-sm text-neutral-500">
              Split percentages must add up to 100%
            </p>
          </section>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {hasErrors && (
        <Alert variant="error">
          <AlertTitle>Validation Errors</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {Object.entries(state.errors).map(([field, error]) => (
                <li key={field}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Submit Button */}
      <div className="space-y-3">
        {!state.proposal && !state.isBuilding && state.dotAmount === '' && (
          <Alert>
            <AlertDescription>
              Enter a DOT amount (minimum 100 DOT) to continue
            </AlertDescription>
          </Alert>
        )}
        {!state.proposal && !state.isBuilding && state.dotAmount !== '' && hasErrors && (
          <Alert>
            <AlertDescription>
              Please fix the validation errors above to continue
            </AlertDescription>
          </Alert>
        )}
        {state.proposal && !hasErrors && !state.isBuilding && (
          <Alert variant="success">
            <AlertDescription>
              Proposal ready! Click below to preview your governance proposal.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={hasErrors || !state.proposal || state.isBuilding}
            className="min-w-[200px]"
          >
            {state.isBuilding ? 'Building Proposal...' : 'Continue to Preview'}
          </Button>
        </div>
      </div>
    </form>
  );
}
