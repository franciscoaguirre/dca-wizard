/**
 * Proposal Preview Component
 * Shows a compact preview of the DCA proposal before submission
 */

import { useState, useEffect } from 'react';
import type { DcaProposal } from '../governance/builder';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Info, Code2, Copy, Check } from 'lucide-react';
import {
  encodeProposalCall,
  DESCRIPTOR_INSTRUCTIONS,
} from '../governance/call-encoder';

interface ProposalPreviewProps {
  proposal: DcaProposal;
  onBack: () => void;
  onNext: () => void;
}

export function ProposalPreview({ proposal, onBack, onNext }: ProposalPreviewProps) {
  const { inputs, calculations } = proposal;
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);

  // Attempt to encode the proposal on mount
  useEffect(() => {
    (async () => {
      setIsEncoding(true);
      const result = await encodeProposalCall(proposal);
      setEncoded(result.encoded);
      setEncodingError(result.error);
      setIsEncoding(false);
    })();
  }, [proposal]);

  const handleCopyInstructions = () => {
    navigator.clipboard.writeText(DESCRIPTOR_INSTRUCTIONS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate estimated stablecoin per return
  const estimatedPerReturn =
    (calculations?.estimatedUsdtPerReturn ?? 0n) > 0n
      ? Number(calculations.estimatedUsdtPerReturn) / 1e6
      : Number(calculations?.estimatedUsdcPerReturn ?? 0n) / 1e6;

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
                <span className="text-neutral-400 mx-2">→</span>
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

            {/* DCA Strategy & Returns in 2 columns */}
            <div className="grid grid-cols-2 gap-6">
              {/* DCA Strategy */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">DCA Strategy</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Total Trades</span>
                    <span className="text-neutral-800 font-medium">
                      {calculations?.totalTrades?.toLocaleString() ?? '—'}
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

              {/* Returns */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-neutral-700">Returns</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Frequency</span>
                    <span className="text-neutral-800 font-medium">
                      Every {inputs?.returnFrequencyDays ?? 0} day(s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Total returns</span>
                    <span className="text-neutral-800 font-medium">
                      {inputs?.numberOfReturns ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Est. per return</span>
                    <span className="text-neutral-800 font-medium">
                      ~${(estimatedPerReturn ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Split Configuration & Fees */}
            <div className="pt-4 border-t border-neutral-200 space-y-2">
              <p className="text-sm">
                <span className="text-neutral-500">Split:</span>{' '}
                <span className="font-medium text-neutral-800">
                  {inputs?.treasurySplitPercent ?? 0}% Treasury / {inputs?.salarySplitPercent ?? 0}% Salary
                </span>
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Est. fees (Asset Hub)</span>
                <span className="text-neutral-800 font-medium">
                  ~{(Number(calculations?.feeEstimate ?? 0n) / 1e10).toFixed(3)} DOT
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">XCM fee stash (Hydration)</span>
                <span className="text-neutral-800 font-medium">
                  ~{(Number(calculations?.feeStash ?? 0n) / 1e10).toFixed(3)} DOT
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Encoded Call Data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Encoded Transaction</CardTitle>
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
                  <span className="text-xs text-neutral-500">{(encoded.length - 2) / 2} bytes</span>
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
            <div className="space-y-4">
              <Alert variant="warning">
                <Code2 className="h-4 w-4" />
                <AlertTitle>Encoding Not Complete</AlertTitle>
                <AlertDescription>{encodingError}</AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-neutral-700">
                    Generate Chain Descriptors
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInstructions(!showInstructions)}
                  >
                    {showInstructions ? 'Hide' : 'Show'} Instructions
                  </Button>
                </div>

                {showInstructions && (
                  <div className="relative">
                    <div className="bg-neutral-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-xs text-neutral-100 font-mono whitespace-pre-wrap">
                        {DESCRIPTOR_INSTRUCTIONS}
                      </pre>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={handleCopyInstructions}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Note */}
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertTitle>Next Steps</AlertTitle>
        <AlertDescription>
          After submission, this proposal will be created as a referendum. It will need to go
          through the governance voting process before execution.
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
