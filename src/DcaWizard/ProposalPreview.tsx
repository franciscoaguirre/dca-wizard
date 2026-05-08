/**
 * Proposal Preview Component
 * Shows the batched proposal breakdown; contents adapt to the ProposalMode.
 */

import { useState, useEffect, useMemo } from 'react';
import type { DcaProposal } from '../governance/builder';
import type { ProposalMode } from '../api/constants';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Info, Code2, Copy, Check } from 'lucide-react';
import { encodeProposal, getTransactionBreakdown } from '../governance/call-encoder';

const MODE_DESCRIPTIONS: Record<ProposalMode, string> = {
  setup:
    'A single V5 XCM transfers DOT from the Fellowship Treasury to its Hydration sovereign and starts a DCA schedule that converts DOT into HOLLAR over time. Accumulated HOLLAR remains on the Fellowship Treasury sovereign on Hydration.',
  return:
    'This proposal schedules periodic returns of HOLLAR from the Fellowship Treasury sovereign on Hydration back to Fellowship Treasury and Salary on Asset Hub via an XCM hop (AH → Hydration → AH).',
  both:
    'A combined setup XCM and a scheduled periodic-return XCM, batched into one proposal. DCA accumulates HOLLAR on the Fellowship Treasury sovereign on Hydration, then periodic returns split it between Treasury and Salary on Asset Hub.',
};

interface ProposalPreviewProps {
  proposal: DcaProposal;
  dotPriceUsd: number;
  onBack: () => void;
  onNext: () => void;
}

function formatHollarDisplay(amount18: bigint): string {
  // Approximate two decimals: divide by 10^16 for centi-HOLLAR, show with .XX
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
    <div className="space-y-6">
      {/* Warnings */}
      {proposal.validation.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Important Considerations</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {proposal.validation.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Consolidated Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Proposal Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Converting section (setup / both) */}
            {showSetup && (
              <div className="pb-4 border-b border-neutral-200">
                <p className="text-sm text-neutral-500 mb-1">Converting</p>
                <p className="text-xl font-semibold text-neutral-800">
                  {(Number(inputs.dotAmount ?? 0n) / 1e10).toLocaleString()} DOT
                  <span className="text-neutral-400 mx-2">&rarr;</span>
                  <span className="text-success-600">
                    ~{formatHollarDisplay(calculations?.estimatedHollarTotal ?? 0n)} HOLLAR
                  </span>
                </p>
              </div>
            )}

            {/* Summary columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {showSetup && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-neutral-700">DCA Strategy</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Total Trades</span>
                      <span className="text-neutral-800 font-medium">
                        {calculations?.totalTrades?.toLocaleString() ?? '---'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">DOT per trade</span>
                      <span className="text-neutral-800 font-medium">
                        ~{(Number(calculations?.dotPerTrade ?? 0n) / 1e10).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Duration</span>
                      <span className="text-neutral-800 font-medium">
                        {inputs.dcaDurationDays ?? 0} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Slippage</span>
                      <span className="text-neutral-800 font-medium">
                        {inputs.slippagePercent ?? 0}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {showReturn && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-neutral-700">Periodic Returns</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Frequency</span>
                      <span className="text-neutral-800 font-medium">
                        Every {inputs.returnFrequencyDays ?? 7} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Returns</span>
                      <span className="text-neutral-800 font-medium">
                        {inputs.numberOfReturns ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Per return</span>
                      <span className="text-neutral-800 font-medium">
                        ~{formatHollarDisplay(calculations?.estimatedHollarPerReturn ?? 0n)} HOLLAR
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">Distribution</h4>
                <div className="space-y-2 text-sm">
                  {showReturn && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Fellowship Treasury</span>
                        <span className="text-neutral-800 font-medium">
                          {inputs.treasurySplitPercent ?? 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Fellowship Salary</span>
                        <span className="text-neutral-800 font-medium">
                          {inputs.salarySplitPercent ?? 0}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Governance</span>
                    <span className="text-neutral-800 font-medium">Architects track</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Est. fees</span>
                    <span className="text-neutral-800 font-medium">
                      ~{(Number(calculations?.feeEstimate ?? 0n) / 1e10).toFixed(3)} DOT
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
            {breakdown.totalCalls === 1 ? 'Proposal Call' : `Batched Proposal (${breakdown.totalCalls} calls)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 mb-4">
            {breakdown.totalCalls === 1
              ? 'A single root call submitted on the Collectives chain. The Scheduler handles periodic execution where applicable.'
              : 'Operations are wrapped in a Utility.batch_all call on the Collectives chain. The Scheduler handles periodic execution of the return cycle.'}
          </p>
          <div className="space-y-3">
            {breakdown.calls.map((call, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-neutral-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-neutral-800">
                      {idx + 1}. {call.name}
                    </p>
                    <p className="text-sm text-neutral-500">{call.description}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-500 whitespace-nowrap">
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
          <CardTitle>Encoded Call Data</CardTitle>
        </CardHeader>
        <CardContent>
          {isEncoding ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-sm text-neutral-600">Encoding transaction...</p>
              </div>
            </div>
          ) : encoded ? (
            <div className="space-y-3">
              <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-neutral-700">Call Data:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{(encoded.length - 2) / 2} bytes</span>
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
                <div className="bg-white rounded border border-neutral-200 p-3 overflow-x-auto">
                  <code className="text-xs text-neutral-700 font-mono break-all">
                    {encoded}
                  </code>
                </div>
              </div>

              {(encoded.length - 2) / 2 > 10 * 1024 && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Large Call</AlertTitle>
                  <AlertDescription>
                    This call is larger than 10KB and will need to be submitted as a preimage first.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <Alert variant="warning">
              <Code2 className="h-4 w-4" />
              <AlertTitle>Encoding Error</AlertTitle>
              <AlertDescription>{encodingError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>{MODE_DESCRIPTIONS[mode]}</AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back to Form
        </Button>
        <Button size="lg" onClick={onNext}>
          Submit Proposal
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
