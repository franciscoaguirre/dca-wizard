/**
 * Submit Proposal Component
 * Handles the final submission of the referendum proposal
 */

import { useState } from 'react';
import type { DcaProposal } from '../governance/builder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface SubmitProposalProps {
  proposal: DcaProposal;
  onBack: () => void;
}

export function SubmitProposal({ proposal, onBack }: SubmitProposalProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'signing' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [referendumId] = useState<number | null>(null);

  const handleSubmit = async () => {
    try {
      setStatus('connecting');
      setError(null);

      // In production, this would:
      // 1. Connect to wallet (via ReactiveDot or polkadot-api)
      // 2. Build the complete batch call with chain API
      // 3. Create preimage if call is large
      // 4. Submit referendum via Referenda.submit
      // 5. Sign and broadcast transaction
      // 6. Monitor for finalization
      // 7. Extract referendum ID from events

      // For now, show that this functionality needs wallet integration
      throw new Error(
        'Wallet integration required. This needs ReactiveDot/polkadot-api wallet connection.'
      );

      // Simulated flow (would be real in production):
      // setStatus('signing');
      // await new Promise(resolve => setTimeout(resolve, 2000));
      //
      // setStatus('submitting');
      // const tx = await assetHubApi.tx.Referenda.submit({ ... });
      // const result = await tx.signAndSend(account);
      //
      // setReferendumId(extractReferendumId(result.events));
      // setStatus('success');

    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to submit proposal');
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Status */}
      {status === 'idle' && (
        <Alert>
          <AlertTitle>Ready to Submit</AlertTitle>
          <AlertDescription>
            Click the button below to connect your wallet and submit the referendum proposal.
          </AlertDescription>
        </Alert>
      )}

      {status === 'connecting' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Connecting to Wallet</AlertTitle>
          <AlertDescription>
            Please authorize the connection in your wallet extension.
          </AlertDescription>
        </Alert>
      )}

      {status === 'signing' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Awaiting Signature</AlertTitle>
          <AlertDescription>
            Please sign the transaction in your wallet.
          </AlertDescription>
        </Alert>
      )}

      {status === 'submitting' && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Submitting Proposal</AlertTitle>
          <AlertDescription>
            Transaction is being processed on-chain. This may take a few moments.
          </AlertDescription>
        </Alert>
      )}

      {status === 'success' && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Proposal Submitted Successfully!</AlertTitle>
          <AlertDescription>
            {referendumId !== null && (
              <p>Your referendum ID is: <strong>#{referendumId}</strong></p>
            )}
            <p className="mt-2">
              The proposal is now open for voting. Visit Polkassembly or Subsquare to track its
              progress.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Submission Failed</AlertTitle>
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Proposal Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Proposal Summary</CardTitle>
          <CardDescription>
            Final review before submission
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Network:</span>
              <span className="text-sm text-gray-600">
                {proposal.inputs.network === 'polkadot' ? 'Polkadot' : 'Paseo'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">DOT Amount:</span>
              <span className="text-sm text-gray-600">
                {(Number(proposal.inputs.dotAmount) / 1e10).toLocaleString()} DOT
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Target:</span>
              <span className="text-sm text-gray-600">
                {proposal.inputs.stablecoin}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Duration:</span>
              <span className="text-sm text-gray-600">
                {proposal.inputs.dcaDurationDays} days
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm font-medium">Total Trades:</span>
              <span className="text-sm text-gray-600">
                {proposal.calculations.totalTrades}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements Card */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
            <li>
              You need a Polkadot wallet (Talisman, Subwallet, PolkadotJS, etc.)
            </li>
            <li>
              Your account must have sufficient DOT for the submission deposit (typically ~100 DOT)
            </li>
            <li>
              The proposal will be submitted as a referendum to the Treasury track
            </li>
            <li>
              After submission, the community will vote on the proposal
            </li>
            <li>
              If approved, the proposal will execute automatically after the decision period
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Next Steps Card (shown after success) */}
      {status === 'success' && (
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>
                Track your proposal on governance platforms:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>Polkassembly: polkassembly.io</li>
                  <li>Subsquare: polkadot.subsquare.io</li>
                </ul>
              </li>
              <li>
                Engage with the community to discuss and promote your proposal
              </li>
              <li>
                Monitor voting progress during the decision period
              </li>
              <li>
                If approved, the proposal will execute automatically
              </li>
              <li>
                Monitor DCA execution on Hydration via block explorer
              </li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={status === 'connecting' || status === 'signing' || status === 'submitting'}
        >
          Back to Preview
        </Button>

        {status !== 'success' && (
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={status === 'connecting' || status === 'signing' || status === 'submitting'}
          >
            {status === 'connecting' || status === 'signing' || status === 'submitting' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Submit Referendum'
            )}
          </Button>
        )}
      </div>

      {/* Implementation Note */}
      <Alert variant="warning">
        <AlertTitle>Implementation Note</AlertTitle>
        <AlertDescription>
          This is a prototype. Full wallet integration with ReactiveDot/polkadot-api is required
          for actual submission. The submission flow would involve:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Building the complete Utility.batch_all call with chain descriptors</li>
            <li>Creating and noting a preimage if the call exceeds size limits</li>
            <li>Submitting via Referenda.submit with appropriate origin and track</li>
            <li>Signing and broadcasting the transaction</li>
            <li>Monitoring events for referendum ID</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
