/**
 * DCA Wizard Form Component
 * Main form for configuring DCA parameters with DEX-style swap interface
 */

import type { WizardState, WizardAction } from './use-wizard-state';
import type { StablecoinType } from '../api/constants';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Slider } from '../components/ui/slider';
import { ArrowDown } from 'lucide-react';
import { useDotPrice } from '../api/price';
import { useEffect } from 'react';

interface DcaWizardFormProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
}

export function DcaWizardForm({ state, dispatch, onNext }: DcaWizardFormProps) {
  const hasErrors = Object.keys(state.errors).length > 0;
  const { price: dotPrice } = useDotPrice();

  // Sync DOT price to state
  useEffect(() => {
    dispatch({ type: 'SET_DOT_PRICE', payload: dotPrice });
  }, [dotPrice, dispatch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasErrors && state.proposal) {
      onNext();
    }
  };

  // Calculate USD value and estimated stablecoin output
  const dotAmountNum = parseFloat(state.dotAmount) || 0;
  const usdValue = dotAmountNum * dotPrice;
  const estimatedStableOutput = usdValue * 0.99; // 1% slippage estimate

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* DEX-Style Swap Interface */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* From: DOT */}
            <div className="space-y-2">
              <Label className="text-sm text-neutral-500">You're converting</Label>
              <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                <div className="flex items-center justify-between">
                  <Input
                    type="text"
                    placeholder="0"
                    value={state.dotAmount}
                    onChange={(e) =>
                      dispatch({ type: 'SET_DOT_AMOUNT', payload: e.target.value })
                    }
                    onBlur={() =>
                      dispatch({ type: 'SET_FIELD_TOUCHED', payload: 'dotAmount' })
                    }
                    className="border-0 bg-transparent text-2xl font-semibold w-full focus:ring-0 p-0"
                  />
                  <span className="text-lg font-semibold text-neutral-700 ml-2">DOT</span>
                </div>
                {dotAmountNum > 0 && (
                  <p className="text-sm text-neutral-500 mt-1">
                    ~${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </div>
              {state.touched.dotAmount && state.errors.dotAmount && (
                <p className="text-sm text-error-500">{state.errors.dotAmount}</p>
              )}
            </div>

            {/* Arrow Separator */}
            <div className="flex justify-center">
              <div className="bg-neutral-100 rounded-full p-2">
                <ArrowDown className="h-5 w-5 text-neutral-500" />
              </div>
            </div>

            {/* To: Stablecoin */}
            <div className="space-y-2">
              <Label className="text-sm text-neutral-500">To receive (estimated)</Label>
              <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-semibold text-neutral-700">
                    {dotAmountNum > 0
                      ? `~${estimatedStableOutput.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : '0'}
                  </span>
                  <Select
                    value={state.stablecoin}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_STABLECOIN',
                        payload: e.target.value as StablecoinType,
                      })
                    }
                    className="w-auto border-0 bg-white font-semibold"
                  >
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="BOTH">Both (50/50)</option>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DCA Configuration - 4 columns on desktop */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">DCA Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dcaFrequency">Frequency</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="dcaFrequency"
                  type="number"
                  min="10"
                  value={state.dcaFrequencyBlocks}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      dispatch({ type: 'SET_DCA_FREQUENCY', payload: val });
                    }
                  }}
                  className="w-full"
                />
                <span className="text-sm text-neutral-500 whitespace-nowrap">blocks</span>
              </div>
              <p className="text-xs text-neutral-500">
                ~{Math.round((state.dcaFrequencyBlocks * 6) / 60)} min
              </p>
              {state.errors.dcaFrequencyBlocks && (
                <p className="text-xs text-error-500">{state.errors.dcaFrequencyBlocks}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dcaDuration">Duration</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="dcaDuration"
                  type="number"
                  min="1"
                  value={state.dcaDurationDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      dispatch({ type: 'SET_DCA_DURATION', payload: val });
                    }
                  }}
                  className="w-full"
                />
                <span className="text-sm text-neutral-500 whitespace-nowrap">days</span>
              </div>
              {state.errors.dcaDurationDays && (
                <p className="text-xs text-error-500">{state.errors.dcaDurationDays}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slippage">Slippage</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="slippage"
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={state.slippagePercent}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) {
                      dispatch({ type: 'SET_SLIPPAGE', payload: val });
                    }
                  }}
                  className="w-full"
                />
                <span className="text-sm text-neutral-500">%</span>
              </div>
              {state.errors.slippagePercent && (
                <p className="text-xs text-error-500">{state.errors.slippagePercent}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Total Trades</Label>
              <div className="pt-2">
                <p className="text-lg font-semibold text-neutral-800">
                  {state.proposal?.calculations?.totalTrades?.toLocaleString() ?? '—'}
                </p>
                {state.proposal?.calculations?.dotPerTrade != null && (
                  <p className="text-xs text-neutral-500">
                    {(Number(state.proposal.calculations.dotPerTrade) / 1e10).toFixed(2)} DOT/tx
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Return Settings - Compact */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Return Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="returnFrequency">Return every</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="returnFrequency"
                  type="number"
                  min="1"
                  value={state.returnFrequencyDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      dispatch({ type: 'SET_RETURN_FREQUENCY', payload: val });
                    }
                  }}
                  className="w-full"
                />
                <span className="text-sm text-neutral-500 whitespace-nowrap">day(s)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Number of returns</Label>
              <div className="pt-2">
                <p className="text-lg font-semibold text-neutral-800">
                  {state.numberOfReturns}
                </p>
                <p className="text-xs text-neutral-500">
                  Auto-calculated to cover {state.dcaDurationDays} days
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Beneficiary Split */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Beneficiary Split</h2>
          <div className="space-y-4">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-neutral-700">Fellowship Treasury</span>
              <span className="text-neutral-700">Fellowship Salary</span>
            </div>

            <Slider
              id="beneficiarySplit"
              value={state.treasurySplitPercent}
              onChange={(value) =>
                dispatch({
                  type: 'SET_TREASURY_SPLIT',
                  payload: value,
                })
              }
              min={0}
              max={100}
              step={1}
            />

            <div className="flex justify-between text-lg font-semibold">
              <span className="text-primary-600">{state.treasurySplitPercent}%</span>
              <span className="text-primary-600">{100 - state.treasurySplitPercent}%</span>
            </div>
          </div>
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

      {/* Proposal Validation Errors */}
      {state.proposal?.validation?.errors && state.proposal.validation.errors.length > 0 && (
        <Alert variant="error">
          <AlertTitle>Configuration Issue</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {state.proposal.validation.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
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
