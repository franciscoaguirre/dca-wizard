/**
 * Proposal Preview Component
 * Shows detailed preview of the DCA proposal before submission
 */

import type { DcaProposal } from '../governance/builder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ArrowRight, AlertTriangle, Info } from 'lucide-react';

interface ProposalPreviewProps {
  proposal: DcaProposal;
  onBack: () => void;
  onNext: () => void;
}

export function ProposalPreview({ proposal, onBack, onNext }: ProposalPreviewProps) {
  const { inputs, calculations, validation } = proposal;

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
