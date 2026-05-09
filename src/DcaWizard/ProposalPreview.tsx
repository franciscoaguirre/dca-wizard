/**
 * Proposal Preview Component
 * Shows the batched proposal breakdown; contents adapt to the ProposalMode.
 */

import { useState, useEffect, useMemo } from 'react';
import type { DcaProposal } from '../governance/builder';
import { TIMING } from '../api/constants';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Code2, Copy, Check } from 'lucide-react';
import { encodeProposal, getTransactionBreakdown } from '../governance/call-encoder';

interface ProposalPreviewProps {
  proposal: DcaProposal;
  dotPriceUsd: number;
  onBack: () => void;
  onNext: () => void;
}

function formatHollarDisplay(amount18: bigint): string {
  const centi = amount18 / 10n ** 16n;
  const whole = centi / 100n;
  const frac = (centi % 100n).toString().padStart(2, '0');
  return `${whole.toLocaleString()}.${frac}`;
}

export function ProposalPreview({ proposal, dotPriceUsd, onBack, onNext }: ProposalPreviewProps) {
  const { inputs, calculations } = proposal;
  const mode = inputs.mode;
  const showSetup = mode !== 'return';
  const showReturn = mode !== 'setup';
  const [copied, setCopied] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);

  const breakdown = useMemo(() => getTransactionBreakdown(proposal), [proposal]);

  useEffect(() => {
    let cancelled = false;
    setIsEncoding(true);
    setEncoded(null);
    setEncodingError(null);
    encodeProposal(proposal, dotPriceUsd).then((result) => {
      if (cancelled) return;
      setEncoded(result.encoded);
      setEncodingError(result.error);
      setIsEncoding(false);
    });
    return () => {
      cancelled = true;
    };
  }, [proposal, dotPriceUsd]);

  const handleCopyEncoded = () => {
    if (encoded) {
      navigator.clipboard.writeText(encoded);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5">
      {proposal.validation.warnings.length > 0 && (
        <Alert variant="warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
            <div>
              <AlertTitle>Things to check before submitting</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  {proposal.validation.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* Consolidated Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Proposal summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {showSetup && (
              <div className="pb-4 border-b border-divider">
                <p className="text-xs text-tertiary uppercase tracking-wide mb-1">Converting</p>
                <p className="text-xl font-semibold text-primary">
                  {(Number(inputs.dotAmount ?? 0n) / 1e10).toLocaleString()} DOT
                  <span className="text-tertiary mx-2">→</span>
                  ≈ {formatHollarDisplay(calculations?.estimatedHollarTotal ?? 0n)} HOLLAR
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {showSetup && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-tertiary uppercase tracking-wide">DCA strategy</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-secondary">Frequency</span>
                      <span className="text-primary font-medium">
                        Every {(inputs.dcaFrequencyBlocks ?? 0).toLocaleString()} blocks
                        {' '}(≈ {Math.round(((inputs.dcaFrequencyBlocks ?? 0) * TIMING.BLOCK_TIME_SECONDS) / 60)} min)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Total trades</span>
                      <span className="text-primary font-medium">
                        {calculations?.totalTrades?.toLocaleString() ?? '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">DOT per trade</span>
                      <span className="text-primary font-medium">
                        ≈ {(Number(calculations?.dotPerTrade ?? 0n) / 1e10).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Duration</span>
                      <span className="text-primary font-medium">
                        {inputs.dcaDurationDays ?? 0} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Slippage</span>
                      <span className="text-primary font-medium">
                        {inputs.slippagePercent ?? 0}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {showReturn && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-tertiary uppercase tracking-wide">Periodic returns</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-secondary">Frequency</span>
                      <span className="text-primary font-medium">
                        Every {inputs.returnFrequencyDays ?? 7} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Returns</span>
                      <span className="text-primary font-medium">
                        {inputs.numberOfReturns ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Per return</span>
                      <span className="text-primary font-medium">
                        ≈ {formatHollarDisplay(calculations?.estimatedHollarPerReturn ?? 0n)} HOLLAR
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-tertiary uppercase tracking-wide">Distribution</h4>
                <div className="space-y-2 text-sm">
                  {showReturn && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-secondary">Fellowship Treasury</span>
                        <span className="text-primary font-medium">
                          {inputs.treasurySplitPercent ?? 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary">Fellowship Salary</span>
                        <span className="text-primary font-medium">
                          {inputs.salarySplitPercent ?? 0}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-secondary">Governance</span>
                    <span className="text-primary font-medium">Architects track</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary">Est. fees</span>
                    <span className="text-primary font-medium">
                      ≈ {(Number(calculations?.feeEstimate ?? 0n) / 1e10).toFixed(3)} DOT
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operations Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            {breakdown.totalCalls === 1 ? 'Proposal call' : `Batched proposal (${breakdown.totalCalls} calls)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-secondary mb-4">
            {breakdown.totalCalls === 1
              ? 'A single root call submitted on the Collectives chain. The Scheduler handles periodic execution where applicable.'
              : 'Operations are wrapped in a Utility.batch_all call on the Collectives chain. The Scheduler handles periodic execution of the return cycle.'}
          </p>
          <div className="space-y-2">
            {breakdown.calls.map((call, idx) => (
              <div
                key={idx}
                className="p-4 rounded-nested bg-surface-nested"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {idx + 1}. {call.name}
                    </p>
                    <p className="text-sm text-secondary mt-0.5">{call.description}</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-action-secondary text-secondary whitespace-nowrap">
                    {call.timing}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Encoded Call Data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Encoded call data</CardTitle>
        </CardHeader>
        <CardContent>
          {isEncoding ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto mb-2" />
                <p className="text-sm text-secondary">Encoding transaction…</p>
              </div>
            </div>
          ) : encoded ? (
            <div className="space-y-3">
              <div className="bg-surface-nested rounded-nested p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-tertiary uppercase tracking-wide">Call data</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-tertiary">{(encoded.length - 2) / 2} bytes</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyEncoded}
                    >
                      {copied ? (
                        <><Check className="w-3 h-3 mr-1" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3 mr-1" /> Copy</>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <code className="text-xs text-secondary font-mono break-all">
                    {encoded}
                  </code>
                </div>
              </div>

              {(encoded.length - 2) / 2 > 10 * 1024 && (
                <Alert variant="warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
                    <div>
                      <AlertTitle>Large call</AlertTitle>
                      <AlertDescription>
                        This call is larger than 10 KB and will be submitted as a preimage first.
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              )}
            </div>
          ) : (
            <Alert variant="warning">
              <div className="flex items-start gap-2">
                <Code2 className="h-4 w-4 mt-0.5 text-warning" />
                <div>
                  <AlertTitle>Encoding error</AlertTitle>
                  <AlertDescription>{encodingError}</AlertDescription>
                </div>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onNext}>
          Continue to submit
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
