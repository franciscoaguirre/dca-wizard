/**
 * Proposal Preview Component
 * Shows the single batched proposal with breakdown of operations
 */

import { useState, useEffect } from 'react';
import type { DcaProposal } from '../governance/builder';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Info, Code2, Copy, Check } from 'lucide-react';
import { encodeProposal, getTransactionBreakdown } from '../governance/call-encoder';

interface ProposalPreviewProps {
  proposal: DcaProposal;
  dotPriceUsd: number;
  onBack: () => void;
  onNext: () => void;
}

export function ProposalPreview({ proposal, dotPriceUsd, onBack, onNext }: ProposalPreviewProps) {
  const { inputs, calculations } = proposal;
  const [copied, setCopied] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);

  const breakdown = getTransactionBreakdown(proposal);

  // Encode the batched proposal
  useEffect(() => {
    (async () => {
      setIsEncoding(true);
      setEncoded(null);
      setEncodingError(null);
      const result = await encodeProposal(proposal, dotPriceUsd);
      setEncoded(result.encoded);
      setEncodingError(result.error);
      setIsEncoding(false);
    })();
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
            {/* Converting section */}
            <div className="pb-4 border-b border-neutral-200">
              <p className="text-sm text-neutral-500 mb-1">Converting</p>
              <p className="text-xl font-semibold text-neutral-800">
                {(Number(inputs?.dotAmount ?? 0n) / 1e10).toLocaleString()} DOT
                <span className="text-neutral-400 mx-2">&rarr;</span>
                <span className="text-success-600">
                  ~${(
                    (Number(calculations?.estimatedUsdtTotal ?? 0n) +
                      Number(calculations?.estimatedUsdcTotal ?? 0n)) /
                    1e6
                  ).toLocaleString()}{' '}
                  {inputs?.stablecoin ?? 'USDT'}
                </span>
              </p>
            </div>

            {/* DCA Strategy, Returns & Split in columns */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
              {/* DCA Strategy */}
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
                      {inputs?.dcaDurationDays ?? 0} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Slippage</span>
                    <span className="text-neutral-800 font-medium">
                      {inputs?.slippagePercent ?? 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Periodic Returns */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">Periodic Returns</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Frequency</span>
                    <span className="text-neutral-800 font-medium">
                      Every {inputs?.returnFrequencyDays ?? 7} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Returns</span>
                    <span className="text-neutral-800 font-medium">
                      {inputs?.numberOfReturns ?? 4}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Per return</span>
                    <span className="text-neutral-800 font-medium">
                      ~${(
                        (Number(calculations?.estimatedUsdtPerReturn ?? 0n) +
                          Number(calculations?.estimatedUsdcPerReturn ?? 0n)) /
                        1e6
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Split & Governance */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">Distribution</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Fellowship Treasury</span>
                    <span className="text-neutral-800 font-medium">
                      {inputs?.treasurySplitPercent ?? 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Fellowship Salary</span>
                    <span className="text-neutral-800 font-medium">
                      {inputs?.salarySplitPercent ?? 0}%
                    </span>
                  </div>
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

      {/* Batched Operations Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Single Batched Proposal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 mb-4">
            All operations are batched into a single Utility.batch_all call on the Collectives chain.
            The Scheduler handles delayed and periodic execution.
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

      {/* Info Note */}
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertTitle>How It Works</AlertTitle>
        <AlertDescription>
          This single proposal executes on the Collectives chain via the Architects track.
          When approved, the batch executes immediately to transfer DOT, then the Scheduler
          handles the DCA start (after warmup) and periodic stablecoin returns automatically.
        </AlertDescription>
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
