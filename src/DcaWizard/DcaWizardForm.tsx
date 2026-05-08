/**
 * DCA Wizard Form Component
 * Mode-aware form: shows setup fields, return fields, or both.
 */

import type { WizardState, WizardAction } from './use-wizard-state';
import type { ProposalMode } from '../api/constants';
import { DEFAULTS, TIMING } from '../api/constants';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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

function formatHollarShort(amount: bigint): string {
  if (amount === 0n) return '0';
  const divisor = 10n ** 18n;
  const whole = amount / divisor;
  const cents = (amount % divisor) / 10n ** 16n;
  return `${whole.toLocaleString()}.${cents.toString().padStart(2, '0')}`;
}

const MODES: Array<{ value: ProposalMode; label: string; description: string }> = [
  { value: 'setup', label: 'Setup only', description: 'Single V5 XCM: transfer DOT + start DCA' },
  { value: 'return', label: 'Return only', description: 'Periodic HOLLAR returns (1 call)' },
  { value: 'both', label: 'Setup + Return', description: 'Setup + scheduled returns (2 calls)' },
];

export function DcaWizardForm({ state, dispatch, onNext }: DcaWizardFormProps) {
  const hasErrors = Object.keys(state.errors).length > 0;
  const { price: dotPrice } = useDotPrice();
  const showSetup = state.mode !== 'return';
  const showReturn = state.mode !== 'setup';

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

  // Estimation (setup + both modes)
  const dotAmountNum = parseFloat(state.dotAmount) || 0;
  const usdValue = dotAmountNum * dotPrice;
  const estimatedHollarOutput = usdValue * 0.99; // 1% slippage estimate; HOLLAR ≈ USD

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Mode selector */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">Proposal Mode</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODES.map((m) => {
              const active = state.mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_MODE', payload: m.value })}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    active
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <p className={`font-semibold ${active ? 'text-primary-700' : 'text-neutral-800'}`}>
                    {m.label}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">{m.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Setup section: DOT → HOLLAR swap + DCA configuration */}
      {showSetup && (
        <>
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

                {/* To: HOLLAR */}
                <div className="space-y-2">
                  <Label className="text-sm text-neutral-500">To receive (estimated)</Label>
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-semibold text-neutral-700">
                        {dotAmountNum > 0
                          ? `~${estimatedHollarOutput.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : '0'}
                      </span>
                      <span className="text-lg font-semibold text-neutral-700 ml-2">HOLLAR</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DCA Configuration */}
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
                    {state.proposal?.calculations?.estimatedHollarTotal != null &&
                      (state.proposal.calculations.totalTrades ?? 0) > 0 && (
                        <p className="text-xs text-neutral-500">
                          ~{formatHollarShort(
                            state.proposal.calculations.estimatedHollarTotal /
                              BigInt(state.proposal.calculations.totalTrades),
                          )} HOLLAR/tx
                        </p>
                      )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Return section: HOLLAR-per-return (return-only mode) + schedule + split */}
      {showReturn && (
        <>
          {state.mode === 'return' && (
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-lg font-semibold text-neutral-800 mb-4">Return Amount</h2>
                <div className="space-y-2">
                  <Label htmlFor="hollarPerReturn">HOLLAR per return</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="hollarPerReturn"
                      type="text"
                      placeholder="0"
                      value={state.hollarAmountPerReturn}
                      onChange={(e) =>
                        dispatch({ type: 'SET_HOLLAR_PER_RETURN', payload: e.target.value })
                      }
                      onBlur={() =>
                        dispatch({ type: 'SET_FIELD_TOUCHED', payload: 'hollarAmountPerReturn' })
                      }
                      className="w-full"
                    />
                    <span className="text-sm text-neutral-500 whitespace-nowrap">HOLLAR</span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Amount of HOLLAR to withdraw from the Fellowship Treasury sovereign on Hydration per scheduled return.
                  </p>
                  {state.touched.hollarAmountPerReturn && state.errors.hollarAmountPerReturn && (
                    <p className="text-xs text-error-500">{state.errors.hollarAmountPerReturn}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-800">Periodic Returns</h2>
                <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={state.returnFrequencyUnit === 'blocks'}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_RETURN_FREQUENCY_UNIT',
                        payload: e.target.checked ? 'blocks' : 'days',
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  Test mode (blocks)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="returnFrequency">Return Frequency</Label>
                  <div className="flex items-center gap-1">
                    {state.returnFrequencyUnit === 'days' ? (
                      <>
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
                        <span className="text-sm text-neutral-500 whitespace-nowrap">days</span>
                      </>
                    ) : (
                      <>
                        <Input
                          id="returnFrequency"
                          type="number"
                          min="1"
                          value={Math.max(
                            1,
                            Math.round(state.returnFrequencyDays * TIMING.BLOCKS_PER_DAY)
                          )}
                          onChange={(e) => {
                            const blocks = parseInt(e.target.value, 10);
                            if (!isNaN(blocks) && blocks > 0) {
                              dispatch({
                                type: 'SET_RETURN_FREQUENCY',
                                payload: blocks / TIMING.BLOCKS_PER_DAY,
                              });
                            }
                          }}
                          className="w-full"
                        />
                        <span className="text-sm text-neutral-500 whitespace-nowrap">blocks</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    {state.returnFrequencyUnit === 'days'
                      ? 'How often HOLLAR is returned to Treasury/Salary'
                      : `~${Math.round(state.returnFrequencyDays * TIMING.BLOCKS_PER_DAY * TIMING.BLOCK_TIME_SECONDS / 60)} min between returns`}
                  </p>
                </div>

                {state.mode === 'return' ? (
                  <div className="space-y-2">
                    <Label htmlFor="numberOfReturns">Number of Returns</Label>
                    <Input
                      id="numberOfReturns"
                      type="number"
                      min="1"
                      max="52"
                      value={state.numberOfReturns}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          dispatch({ type: 'SET_NUMBER_OF_RETURNS', payload: val });
                        }
                      }}
                      className="w-full"
                    />
                    {state.errors.numberOfReturns && (
                      <p className="text-xs text-error-500">{state.errors.numberOfReturns}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Number of Returns</Label>
                    <div className="pt-2">
                      <p className="text-lg font-semibold text-neutral-800">
                        {state.numberOfReturns.toLocaleString()}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {state.returnFrequencyUnit === 'days'
                          ? `Schedule runs ~${state.numberOfReturns * state.returnFrequencyDays} days`
                          : `Schedule runs ~${(
                              state.numberOfReturns *
                              state.returnFrequencyDays *
                              TIMING.BLOCKS_PER_DAY
                            ).toLocaleString()} blocks`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {state.proposal?.calculations?.estimatedHollarPerReturn != null && (
                <div className="mt-4 bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">HOLLAR per return</span>
                    <span className="font-semibold text-neutral-800">
                      ~{formatHollarShort(state.proposal.calculations.estimatedHollarPerReturn)} HOLLAR
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-neutral-500">Total across {state.numberOfReturns} returns</span>
                    <span className="font-semibold text-neutral-800">
                      ~{formatHollarShort(
                        state.proposal.calculations.estimatedHollarPerReturn * BigInt(state.numberOfReturns)
                      )} HOLLAR
                    </span>
                  </div>
                  {state.mode !== 'return' && (
                    <p className="text-xs text-neutral-500 mt-2">
                      Sized to one return period of DCA accumulation, less a {DEFAULTS.RETURN_BUFFER_PERCENT}% buffer for price drift and slippage.
                    </p>
                  )}
                  {state.mode === 'return' && (
                    <p className="text-xs text-neutral-500 mt-2">
                      The Fellowship Treasury sovereign on Hydration must hold at least this total before the first return executes.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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
                    dispatch({ type: 'SET_TREASURY_SPLIT', payload: value })
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

        </>
      )}

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
        {!state.proposal && !state.isBuilding && state.mode !== 'return' && state.dotAmount === '' && (
          <Alert>
            <AlertDescription>
              Enter a DOT amount (minimum 100 DOT) to continue
            </AlertDescription>
          </Alert>
        )}
        {!state.proposal && !state.isBuilding && state.mode === 'return' && state.hollarAmountPerReturn === '' && (
          <Alert>
            <AlertDescription>Enter a HOLLAR amount per return to continue</AlertDescription>
          </Alert>
        )}
        {!state.proposal && !state.isBuilding && hasErrors && (
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
