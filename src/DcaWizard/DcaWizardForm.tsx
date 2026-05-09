/**
 * DCA Wizard Form Component
 * Mode-aware form: shows setup fields, return fields, or both.
 */

import type { WizardState, WizardAction } from './use-wizard-state';
import type { ProposalMode } from '../api/constants';
import { DEFAULTS, TIMING } from '../api/constants';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { NumberInput } from '../components/ui/number-input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Slider } from '../components/ui/slider';
import { TreasurySnapshot } from '../components/TreasurySnapshot';
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
  { value: 'setup', label: 'Setup only', description: 'Transfer DOT and start the DCA schedule.' },
  { value: 'return', label: 'Return only', description: 'Schedule periodic HOLLAR returns.' },
  { value: 'both', label: 'Setup + return', description: 'Start a DCA and schedule its returns.' },
];

export function DcaWizardForm({ state, dispatch, onNext }: DcaWizardFormProps) {
  const hasErrors = Object.keys(state.errors).length > 0;
  const { price: dotPrice } = useDotPrice();
  const showSetup = state.mode !== 'return';
  const showReturn = state.mode !== 'setup';

  useEffect(() => {
    dispatch({ type: 'SET_DOT_PRICE', payload: dotPrice });
  }, [dotPrice, dispatch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasErrors && state.proposal) {
      onNext();
    }
  };

  const dotAmountNum = parseFloat(state.dotAmount) || 0;
  const usdValue = dotAmountNum * dotPrice;
  const estimatedHollarOutput = usdValue * 0.99;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <TreasurySnapshot />

      {/* Mode selector */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold text-primary mb-4">Proposal mode</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODES.map((m) => {
              const active = state.mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_MODE', payload: m.value })}
                  className={`text-left rounded-nested p-4 transition-colors cursor-pointer ${
                    active
                      ? 'bg-selection-container-active border-2 border-default-inverted'
                      : 'bg-surface-nested border-2 border-transparent hover:bg-selection-container-hover'
                  }`}
                >
                  <p className="text-sm font-semibold text-primary">{m.label}</p>
                  <p className="text-xs text-secondary mt-1">{m.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Setup section */}
      {showSetup && (
        <>
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold text-primary mb-4">Convert DOT to HOLLAR</h2>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-tertiary uppercase tracking-wide">You're converting</Label>
                  <div className="bg-surface-nested rounded-nested p-4 focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-[var(--focus-ring)]">
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
                        className="border-0 bg-transparent text-2xl font-semibold w-full p-0 focus-visible:outline-none"
                      />
                      <span className="text-base font-semibold text-primary ml-2">DOT</span>
                    </div>
                    {dotAmountNum > 0 && (
                      <p className="text-xs text-tertiary mt-1">
                        ≈ ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                      </p>
                    )}
                  </div>
                  {state.touched.dotAmount && state.errors.dotAmount && (
                    <p className="text-xs text-error">{state.errors.dotAmount}</p>
                  )}
                </div>

                <div className="flex justify-center">
                  <div className="bg-surface-container rounded-full p-2 -my-3 z-10 relative">
                    <ArrowDown className="h-4 w-4 text-tertiary" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-tertiary uppercase tracking-wide">To receive (estimated)</Label>
                  <div className="bg-surface-nested rounded-nested p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-semibold text-primary">
                        {dotAmountNum > 0
                          ? `≈ ${estimatedHollarOutput.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : '0'}
                      </span>
                      <span className="text-base font-semibold text-primary ml-2">HOLLAR</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold text-primary mb-4">DCA configuration</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dcaFrequency">Frequency</Label>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      id="dcaFrequency"
                      min="10"
                      value={state.dcaFrequencyBlocks}
                      parse={(s) => parseInt(s, 10)}
                      onChange={(val) =>
                        dispatch({ type: 'SET_DCA_FREQUENCY', payload: val })
                      }
                      className="w-full"
                    />
                    <span className="text-xs text-tertiary whitespace-nowrap">blocks</span>
                  </div>
                  <p className="text-xs text-tertiary">
                    ≈ {Math.round((state.dcaFrequencyBlocks * 6) / 60)} min
                  </p>
                  {state.errors.dcaFrequencyBlocks && (
                    <p className="text-xs text-error">{state.errors.dcaFrequencyBlocks}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dcaDuration">Duration</Label>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      id="dcaDuration"
                      min="1"
                      value={state.dcaDurationDays}
                      parse={(s) => parseInt(s, 10)}
                      onChange={(val) =>
                        dispatch({ type: 'SET_DCA_DURATION', payload: val })
                      }
                      className="w-full"
                    />
                    <span className="text-xs text-tertiary whitespace-nowrap">days</span>
                  </div>
                  {state.errors.dcaDurationDays && (
                    <p className="text-xs text-error">{state.errors.dcaDurationDays}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slippage">Slippage</Label>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      id="slippage"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={state.slippagePercent}
                      onChange={(val) =>
                        dispatch({ type: 'SET_SLIPPAGE', payload: val })
                      }
                      className="w-full"
                    />
                    <span className="text-xs text-tertiary">%</span>
                  </div>
                  {state.errors.slippagePercent && (
                    <p className="text-xs text-error">{state.errors.slippagePercent}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Total trades</Label>
                  <div className="pt-1.5">
                    <p className="text-base font-semibold text-primary">
                      {state.proposal?.calculations?.totalTrades?.toLocaleString() ?? '—'}
                    </p>
                    {state.proposal?.calculations?.dotPerTrade != null && (
                      <p className="text-xs text-tertiary">
                        {(Number(state.proposal.calculations.dotPerTrade) / 1e10).toFixed(2)} DOT each
                      </p>
                    )}
                    {state.proposal?.calculations?.estimatedHollarTotal != null &&
                      (state.proposal.calculations.totalTrades ?? 0) > 0 && (
                        <p className="text-xs text-tertiary">
                          ≈ {formatHollarShort(
                            state.proposal.calculations.estimatedHollarTotal /
                              BigInt(state.proposal.calculations.totalTrades),
                          )} HOLLAR each
                        </p>
                      )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Return section */}
      {showReturn && (
        <>
          {state.mode === 'return' && (
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-base font-semibold text-primary mb-4">Return amount</h2>
                <div className="space-y-2">
                  <Label htmlFor="hollarPerReturn">HOLLAR per return</Label>
                  <div className="flex items-center gap-2">
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
                    <span className="text-xs text-tertiary whitespace-nowrap">HOLLAR</span>
                  </div>
                  <p className="text-xs text-tertiary">
                    Amount of HOLLAR to withdraw from the Fellowship Treasury sovereign on Hydration each return.
                  </p>
                  {state.touched.hollarAmountPerReturn && state.errors.hollarAmountPerReturn && (
                    <p className="text-xs text-error">{state.errors.hollarAmountPerReturn}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-primary">Periodic returns</h2>
                <label className="flex items-center gap-2 text-xs text-tertiary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={state.returnFrequencyUnit === 'blocks'}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_RETURN_FREQUENCY_UNIT',
                        payload: e.target.checked ? 'blocks' : 'days',
                      })
                    }
                    className="h-3.5 w-3.5 rounded border cursor-pointer"
                  />
                  Test mode (blocks)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="returnFrequency">Return frequency</Label>
                  <div className="flex items-center gap-2">
                    {state.returnFrequencyUnit === 'days' ? (
                      <>
                        <NumberInput
                          id="returnFrequency"
                          min="1"
                          value={state.returnFrequencyDays}
                          parse={(s) => parseInt(s, 10)}
                          onChange={(val) =>
                            dispatch({ type: 'SET_RETURN_FREQUENCY', payload: val })
                          }
                          className="w-full"
                        />
                        <span className="text-xs text-tertiary whitespace-nowrap">days</span>
                      </>
                    ) : (
                      <>
                        <NumberInput
                          id="returnFrequency"
                          min="1"
                          value={Math.max(
                            1,
                            Math.round(state.returnFrequencyDays * TIMING.BLOCKS_PER_DAY)
                          )}
                          parse={(s) => parseInt(s, 10)}
                          onChange={(blocks) =>
                            dispatch({
                              type: 'SET_RETURN_FREQUENCY',
                              payload: blocks / TIMING.BLOCKS_PER_DAY,
                            })
                          }
                          className="w-full"
                        />
                        <span className="text-xs text-tertiary whitespace-nowrap">blocks</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-tertiary">
                    {state.returnFrequencyUnit === 'days'
                      ? 'How often HOLLAR is returned to Treasury and Salary.'
                      : `≈ ${Math.round(state.returnFrequencyDays * TIMING.BLOCKS_PER_DAY * TIMING.BLOCK_TIME_SECONDS / 60)} min between returns`}
                  </p>
                </div>

                {state.mode === 'return' ? (
                  <div className="space-y-2">
                    <Label htmlFor="numberOfReturns">Number of returns</Label>
                    <NumberInput
                      id="numberOfReturns"
                      min="1"
                      max="52"
                      value={state.numberOfReturns}
                      parse={(s) => parseInt(s, 10)}
                      onChange={(val) =>
                        dispatch({ type: 'SET_NUMBER_OF_RETURNS', payload: val })
                      }
                      className="w-full"
                    />
                    {state.errors.numberOfReturns && (
                      <p className="text-xs text-error">{state.errors.numberOfReturns}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Number of returns</Label>
                    <div className="pt-1.5">
                      <p className="text-base font-semibold text-primary">
                        {state.numberOfReturns.toLocaleString()}
                      </p>
                      <p className="text-xs text-tertiary">
                        {state.returnFrequencyUnit === 'days'
                          ? `Schedule runs ≈ ${state.numberOfReturns * state.returnFrequencyDays} days`
                          : `Schedule runs ≈ ${(
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
                <div className="mt-4 bg-surface-nested rounded-nested p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary">HOLLAR per return</span>
                    <span className="font-semibold text-primary">
                      ≈ {formatHollarShort(state.proposal.calculations.estimatedHollarPerReturn)} HOLLAR
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-secondary">Total across {state.numberOfReturns} returns</span>
                    <span className="font-semibold text-primary">
                      ≈ {formatHollarShort(
                        state.proposal.calculations.estimatedHollarPerReturn * BigInt(state.numberOfReturns)
                      )} HOLLAR
                    </span>
                  </div>
                  {state.mode !== 'return' && (
                    <p className="text-xs text-tertiary mt-2">
                      Sized to one return period of DCA accumulation, less a {DEFAULTS.RETURN_BUFFER_PERCENT}% buffer for price drift and slippage.
                    </p>
                  )}
                  {state.mode === 'return' && (
                    <p className="text-xs text-tertiary mt-2">
                      The Fellowship Treasury sovereign on Hydration must hold at least this total before the first return executes.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold text-primary mb-4">Beneficiary split</h2>
              <div className="space-y-4">
                <div className="flex justify-between text-xs text-secondary">
                  <span>Fellowship Treasury</span>
                  <span>Fellowship Salary</span>
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

                <div className="flex justify-between text-base font-semibold">
                  <span className="text-primary">{state.treasurySplitPercent}%</span>
                  <span className="text-primary">{100 - state.treasurySplitPercent}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {hasErrors && (
        <Alert variant="error">
          <AlertTitle>Fix these before continuing</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {Object.entries(state.errors).map(([field, error]) => (
                <li key={field}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {state.proposal?.validation?.errors && state.proposal.validation.errors.length > 0 && (
        <Alert variant="error">
          <AlertTitle>Configuration issue</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {state.proposal.validation.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {!state.proposal && !state.isBuilding && state.mode !== 'return' && state.dotAmount === '' && (
          <Alert>
            <AlertDescription>
              Enter a DOT amount (minimum 100 DOT) to continue.
            </AlertDescription>
          </Alert>
        )}
        {!state.proposal && !state.isBuilding && state.mode === 'return' && state.hollarAmountPerReturn === '' && (
          <Alert>
            <AlertDescription>Enter a HOLLAR amount per return to continue.</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={hasErrors || !state.proposal || state.isBuilding}
            className="min-w-[200px]"
          >
            {state.isBuilding ? 'Building proposal…' : 'Continue to preview'}
          </Button>
        </div>
      </div>
    </form>
  );
}
