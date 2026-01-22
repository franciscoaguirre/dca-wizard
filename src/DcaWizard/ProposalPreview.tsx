/**
 * Proposal Preview Component
 * Shows detailed preview of the DCA proposal before submission
 */

import { useState, useEffect } from 'react';
import type { DcaProposal } from '../governance/builder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Info, Code2, Copy, Check } from 'lucide-react';
import {
  getTransactionBreakdown,
  encodeProposalCall,
  DESCRIPTOR_INSTRUCTIONS,
} from '../governance/call-encoder';

interface ProposalPreviewProps {
  proposal: DcaProposal;
  onBack: () => void;
  onNext: () => void;
}

export function ProposalPreview({ proposal, onBack, onNext }: ProposalPreviewProps) {
  const { inputs, calculations, validation } = proposal;
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [encoded, setEncoded] = useState<string | null>(null);
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [isEncoding, setIsEncoding] = useState(false);

  const transactionBreakdown = getTransactionBreakdown(proposal);

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

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Important Considerations</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              {validation.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Proposal Summary</CardTitle>
          <CardDescription>
            Review the complete DCA strategy configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Network */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-700">Network</h4>
              <p className="text-sm text-neutral-600">
                {inputs.network === 'polkadot' ? 'Polkadot Mainnet' : 'Paseo Testnet'}
              </p>
            </div>

            {/* Treasury Amount */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-700">Treasury Allocation</h4>
              <p className="text-sm text-neutral-600">
                {(Number(inputs.dotAmount) / 1e10).toLocaleString()} DOT
              </p>
              <p className="text-xs text-neutral-500">
                + {(Number(calculations.feeEstimate) / 1e10).toFixed(2)} DOT estimated fees
              </p>
            </div>

            {/* Target Stablecoin */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-700">Target Stablecoin</h4>
              <p className="text-sm text-neutral-600">{inputs.stablecoin}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DCA Strategy */}
      <Card>
        <CardHeader>
          <CardTitle>DCA Strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-neutral-700">Trade Frequency</h4>
                <p className="text-sm text-neutral-600">
                  Every {inputs.dcaFrequencyBlocks} blocks
                </p>
                <p className="text-xs text-neutral-500">
                  ~{Math.round((inputs.dcaFrequencyBlocks * 6) / 60)} minutes
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-neutral-700">Duration</h4>
                <p className="text-sm text-neutral-600">{inputs.dcaDurationDays} days</p>
                <p className="text-xs text-neutral-500">
                  {calculations.totalDurationBlocks.toLocaleString()} blocks
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-neutral-700">Total Trades</h4>
                <p className="text-sm text-neutral-600">
                  {calculations.totalTrades.toLocaleString()}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-neutral-700">DOT per Trade</h4>
                <p className="text-sm text-neutral-600">
                  {(Number(calculations.dotPerTrade) / 1e10).toFixed(4)} DOT
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-neutral-700">Slippage Tolerance</h4>
              <p className="text-sm text-neutral-600">{inputs.slippagePercent}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expected Output */}
      <Card>
        <CardHeader>
          <CardTitle>Estimated Stablecoin Output</CardTitle>
          <CardDescription>
            Based on current DOT price (estimates may vary)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {calculations.estimatedUsdtTotal > 0n && (
              <div className="flex justify-between items-center p-3 bg-neutral-100 rounded-lg">
                <span className="text-sm font-medium text-neutral-700">Total USDT</span>
                <span className="text-sm text-neutral-600">
                  ${(Number(calculations.estimatedUsdtTotal) / 1e6).toLocaleString()}
                </span>
              </div>
            )}

            {calculations.estimatedUsdcTotal > 0n && (
              <div className="flex justify-between items-center p-3 bg-neutral-100 rounded-lg">
                <span className="text-sm font-medium text-neutral-700">Total USDC</span>
                <span className="text-sm text-neutral-600">
                  ${(Number(calculations.estimatedUsdcTotal) / 1e6).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Return Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Return Schedule</CardTitle>
          <CardDescription>
            Periodic transfers back to Asset Hub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-neutral-700">Frequency</h4>
                <p className="text-sm text-neutral-600">
                  Every {inputs.returnFrequencyDays} day(s)
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-neutral-700">Number of Returns</h4>
                <p className="text-sm text-neutral-600">{inputs.numberOfReturns}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-neutral-700">Amount per Return</h4>
              <div className="space-y-1">
                {calculations.estimatedUsdtPerReturn > 0n && (
                  <p className="text-sm text-neutral-600">
                    USDT: ${(Number(calculations.estimatedUsdtPerReturn) / 1e6).toLocaleString()}
                  </p>
                )}
                {calculations.estimatedUsdcPerReturn > 0n && (
                  <p className="text-sm text-neutral-600">
                    USDC: ${(Number(calculations.estimatedUsdcPerReturn) / 1e6).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Split Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Treasury Split</CardTitle>
          <CardDescription>
            Automatic split on each return
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 border-l-4 border-primary-500 bg-primary-50 rounded-r-lg">
              <span className="text-sm font-medium text-neutral-700">Fellowship Treasury</span>
              <span className="text-sm font-semibold text-primary-600">{inputs.treasurySplitPercent}%</span>
            </div>

            <div className="flex justify-between items-center p-3 border-l-4 border-success-500 bg-success-50 rounded-r-lg">
              <span className="text-sm font-medium text-neutral-700">Fellowship Salary</span>
              <span className="text-sm font-semibold text-success-600">{inputs.salarySplitPercent}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Flow */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Flow</CardTitle>
          <CardDescription>
            How the proposal will execute
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-600">1</span>
              </div>
              <div className="flex-1">
                <h5 className="text-sm font-medium text-neutral-700">Treasury Spend</h5>
                <p className="text-sm text-neutral-600">
                  Send {(Number(inputs.dotAmount) / 1e10).toLocaleString()} DOT from Asset Hub
                  treasury to Hydration
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-600">2</span>
              </div>
              <div className="flex-1">
                <h5 className="text-sm font-medium text-neutral-700">DCA Setup</h5>
                <p className="text-sm text-neutral-600">
                  After 100 blocks (~10 min), schedule DCA on Hydration to convert DOT to{' '}
                  {inputs.stablecoin}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-600">3</span>
              </div>
              <div className="flex-1">
                <h5 className="text-sm font-medium text-neutral-700">Periodic Returns</h5>
                <p className="text-sm text-neutral-600">
                  Every {inputs.returnFrequencyDays} day(s), transfer stablecoins back to Asset
                  Hub with automatic {inputs.treasurySplitPercent}/{inputs.salarySplitPercent} split
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Breakdown</CardTitle>
          <CardDescription>
            {transactionBreakdown.totalCalls} call{transactionBreakdown.totalCalls > 1 ? 's' : ''} in Utility.batch_all
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactionBreakdown.calls.map((call, idx) => (
              <div
                key={idx}
                className="flex items-start space-x-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200"
              >
                <div className="flex-shrink-0">
                  <Code2 className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h5 className="text-sm font-semibold text-neutral-800">{call.name}</h5>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
                      {call.pallet}.{call.call}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 mt-1">{call.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Encoded Call Data */}
      <Card>
        <CardHeader>
          <CardTitle>Encoded Transaction</CardTitle>
          <CardDescription>
            Call data for submission to governance
          </CardDescription>
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
          through the governance voting process before execution. This typically takes 2-4 weeks.
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
