/**
 * Submit Proposal Component
 * Connects a wallet, optionally notes a preimage for large calls, and submits
 * a Fellowship referendum on the Architects track.
 */

import { useState } from 'react';
import type { DcaProposal } from '../governance/builder';
import { encodeProposal } from '../governance/call-encoder';
import { TIMING } from '../api/constants';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { CheckCircle2, Loader2, AlertCircle, Wallet, ExternalLink } from 'lucide-react';
import { Binary } from 'polkadot-api';
import {
  listExtensions,
  connectExtension,
  type InjectedExtension,
  type InjectedPolkadotAccount,
} from '../api/wallets';
import { getCollectivesApi } from '../api/clients/collectives';

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'choose-extension'; names: string[] }
  | { kind: 'choose-account'; extension: InjectedExtension; accounts: InjectedPolkadotAccount[] }
  | { kind: 'ready'; account: InjectedPolkadotAccount }
  | { kind: 'submitting'; account: InjectedPolkadotAccount; step: 'encoding' | 'preimage' | 'referendum' }
  | { kind: 'success'; account: InjectedPolkadotAccount; referendumId: number }
  | { kind: 'error'; message: string; previous: Status };

interface SubmitProposalProps {
  proposal: DcaProposal;
  onBack: () => void;
}

const POLKASSEMBLY_BASE = 'https://collectives.polkassembly.io/referenda';

function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SubmitProposal({ proposal, onBack }: SubmitProposalProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const isProcessing = status.kind === 'submitting' || status.kind === 'connecting';

  const handleConnect = async () => {
    setStatus({ kind: 'connecting' });
    const names = listExtensions();
    if (names.length === 0) {
      setStatus({
        kind: 'error',
        message: 'No wallet extensions found. Install Talisman, Subwallet, or the Polkadot{.js} extension and reload.',
        previous: { kind: 'idle' },
      });
      return;
    }
    if (names.length === 1) {
      await pickExtension(names[0]);
      return;
    }
    setStatus({ kind: 'choose-extension', names });
  };

  const pickExtension = async (name: string) => {
    setStatus({ kind: 'connecting' });
    try {
      const extension = await connectExtension(name);
      const accounts = extension.getAccounts();
      if (accounts.length === 0) {
        setStatus({
          kind: 'error',
          message: `${name} has no accounts available. Add an account in the wallet and reload.`,
          previous: { kind: 'idle' },
        });
        return;
      }
      if (accounts.length === 1) {
        setStatus({ kind: 'ready', account: accounts[0] });
        return;
      }
      setStatus({ kind: 'choose-account', extension, accounts });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to connect to wallet',
        previous: { kind: 'idle' },
      });
    }
  };

  const handleSubmit = async () => {
    if (status.kind !== 'ready') return;
    const account = status.account;
    const readyStatus: Status = { kind: 'ready', account };

    try {
      setStatus({ kind: 'submitting', account, step: 'encoding' });
      const { encoded, error: encErr } = await encodeProposal(proposal, 0);
      if (!encoded) throw new Error(encErr ?? 'Failed to encode proposal');

      const callBinary = Binary.fromHex(encoded);
      const callSize = callBinary.asBytes().length;
      const collectivesApi = await getCollectivesApi('polkadot');

      let bounded:
        | { type: 'Inline'; value: Binary }
        | { type: 'Lookup'; value: { hash: Binary; len: number } };

      if (callSize > 10 * 1024) {
        setStatus({ kind: 'submitting', account, step: 'preimage' });
        const preimageTx = collectivesApi.tx.Preimage.note_preimage({ bytes: callBinary });
        const preimageResult = await preimageTx.signAndSubmit(account.polkadotSigner);
        if (!preimageResult.ok) {
          throw new Error(formatDispatchError(preimageResult.dispatchError));
        }
        const noted = preimageResult.events.find(
          (e: { type: string; value: { type: string } }) =>
            e.type === 'Preimage' && e.value.type === 'Noted',
        );
        if (!noted || noted.value.type !== 'Noted') {
          throw new Error('Preimage submitted but no Noted event was found');
        }
        bounded = {
          type: 'Lookup',
          value: { hash: noted.value.value.hash as unknown as Binary, len: callSize },
        };
      } else {
        bounded = { type: 'Inline', value: callBinary };
      }

      setStatus({ kind: 'submitting', account, step: 'referendum' });
      const submitTx = collectivesApi.tx.FellowshipReferenda.submit({
        proposal_origin: {
          type: 'FellowshipOrigins',
          value: { type: 'Architects', value: undefined },
        } as never,
        proposal: bounded as never,
        enactment_moment: { type: 'After', value: 0 },
      });
      const submitResult = await submitTx.signAndSubmit(account.polkadotSigner);
      if (!submitResult.ok) {
        throw new Error(formatDispatchError(submitResult.dispatchError));
      }
      const submitted = submitResult.events.find(
        (e: { type: string; value: { type: string } }) =>
          e.type === 'FellowshipReferenda' && e.value.type === 'Submitted',
      );
      if (!submitted || submitted.value.type !== 'Submitted') {
        throw new Error('Referendum submitted but no Submitted event was found');
      }
      const referendumId = (submitted.value.value as { index: number }).index;
      setStatus({ kind: 'success', account, referendumId });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Submission failed',
        previous: readyStatus,
      });
    }
  };

  return (
    <div className="space-y-5">
      <SubmissionStatus status={status} />

      {status.kind === 'choose-extension' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Choose a wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.names.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => pickExtension(name)}
                  className="w-full text-left px-4 py-3 rounded-nested bg-surface-nested hover:bg-selection-container-hover transition-colors cursor-pointer"
                >
                  <span className="text-sm font-semibold text-primary capitalize">{name.replace(/-/g, ' ')}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {status.kind === 'choose-account' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Choose an account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.accounts.map((acc) => (
                <button
                  key={acc.address}
                  type="button"
                  onClick={() => setStatus({ kind: 'ready', account: acc })}
                  className="w-full text-left px-4 py-3 rounded-nested bg-surface-nested hover:bg-selection-container-hover transition-colors cursor-pointer"
                >
                  <p className="text-sm font-semibold text-primary">{acc.name ?? 'Unnamed account'}</p>
                  <p className="text-xs text-tertiary font-mono mt-0.5">{shortAddress(acc.address)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Proposal summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-divider">
            <SummaryRow label="Network" value={proposal.inputs.network === 'polkadot' ? 'Polkadot' : 'Paseo'} />
            <SummaryRow label="Mode" value={modeLabel(proposal.inputs.mode)} />
            {proposal.inputs.mode !== 'return' && (
              <>
                <SummaryRow
                  label="DOT amount"
                  value={`${(Number(proposal.inputs.dotAmount ?? 0n) / 1e10).toLocaleString()} DOT`}
                />
                <SummaryRow label="Duration" value={`${proposal.inputs.dcaDurationDays} days`} />
                <SummaryRow
                  label="Frequency"
                  value={`Every ${(proposal.inputs.dcaFrequencyBlocks ?? 0).toLocaleString()} blocks (≈ ${Math.round(((proposal.inputs.dcaFrequencyBlocks ?? 0) * TIMING.BLOCK_TIME_SECONDS) / 60)} min)`}
                />
                <SummaryRow label="Trades" value={String(proposal.calculations.totalTrades)} />
              </>
            )}
            {proposal.inputs.mode !== 'setup' && (
              <SummaryRow
                label="Returns"
                value={`${proposal.inputs.numberOfReturns}× every ${proposal.inputs.returnFrequencyDays} days`}
              />
            )}
            <SummaryRow label="Track" value="Architects (Collectives)" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Before submitting</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-secondary">
            <li>You need an Architect-rank account (Dan 4 or higher) on the Collectives chain.</li>
            <li>The submission deposit is paid from the signing account; refunded when the referendum closes.</li>
            <li>After submission, the Decision Deposit must be placed for the referendum to enter the decision period.</li>
          </ul>
        </CardContent>
      </Card>

      {status.kind === 'success' && (
        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-secondary list-decimal list-inside">
              <li>
                Track this referendum on{' '}
                <a
                  href={`${POLKASSEMBLY_BASE}/${status.referendumId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link hover:text-link-hover inline-flex items-center gap-1"
                >
                  Polkassembly <ExternalLink className="w-3 h-3" />
                </a>
                .
              </li>
              <li>Place the Decision Deposit so voting can begin.</li>
              <li>Engage with the Fellowship to discuss and promote the proposal.</li>
              <li>If approved, execution is automatic. Watch DCA progress on Hydration.</li>
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={isProcessing}>
          Back
        </Button>

        {status.kind === 'idle' && (
          <Button size="lg" onClick={handleConnect}>
            <Wallet className="mr-2 h-4 w-4" />
            Connect wallet
          </Button>
        )}

        {status.kind === 'connecting' && (
          <Button size="lg" disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting…
          </Button>
        )}

        {status.kind === 'ready' && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-tertiary hidden sm:inline">
              {status.account.name ?? shortAddress(status.account.address)}
            </span>
            <Button size="lg" onClick={handleSubmit}>
              Submit referendum
            </Button>
          </div>
        )}

        {status.kind === 'submitting' && (
          <Button size="lg" disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {status.step === 'encoding' && 'Encoding…'}
            {status.step === 'preimage' && 'Noting preimage…'}
            {status.step === 'referendum' && 'Submitting…'}
          </Button>
        )}

        {status.kind === 'error' && (
          <Button size="lg" onClick={() => setStatus(status.previous)}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-secondary">{label}</span>
      <span className="text-sm font-medium text-primary">{value}</span>
    </div>
  );
}

function SubmissionStatus({ status }: { status: Status }) {
  if (status.kind === 'idle') {
    return (
      <Alert>
        <AlertTitle>Ready to submit</AlertTitle>
        <AlertDescription>
          Connecting your wallet will sign one transaction (or two if the call exceeds 10 KB and a preimage is needed first).
        </AlertDescription>
      </Alert>
    );
  }

  if (status.kind === 'submitting') {
    const stepCopy: Record<typeof status.step, { title: string; body: string }> = {
      encoding: {
        title: 'Encoding the proposal',
        body: 'Constructing the batched call.',
      },
      preimage: {
        title: 'Noting the preimage',
        body: 'The proposal call is larger than 10 KB; storing it on-chain first. Sign in your wallet.',
      },
      referendum: {
        title: 'Submitting the referendum',
        body: 'Sign in your wallet to submit on the Architects track.',
      },
    };
    const copy = stepCopy[status.step];
    return (
      <Alert>
        <div className="flex items-start gap-2">
          <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-secondary" />
          <div>
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription>{copy.body}</AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }

  if (status.kind === 'success') {
    return (
      <Alert variant="success">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-success" />
          <div>
            <AlertTitle>Referendum #{status.referendumId} submitted</AlertTitle>
            <AlertDescription>
              The proposal is on-chain. Place the Decision Deposit to start voting.
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }

  if (status.kind === 'error') {
    return (
      <Alert variant="error">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-error" />
          <div>
            <AlertTitle>Submission failed</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }

  return null;
}

function modeLabel(mode: DcaProposal['inputs']['mode']): string {
  switch (mode) {
    case 'setup':
      return 'Setup only';
    case 'return':
      return 'Return only';
    case 'both':
      return 'Setup + return';
  }
}

function formatDispatchError(error: unknown): string {
  if (!error) return 'Transaction reverted';
  try {
    return JSON.stringify(error, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return 'Transaction reverted';
  }
}
