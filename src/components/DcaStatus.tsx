/**
 * Ongoing Fellowship DCA status.
 * Surfaces live DOT→HOLLAR schedules on Hydration owned by the Fellowship Treasury
 * sovereign, and scheduled cash-out return messages on Collectives.
 */

import { Card, CardContent } from './ui/card';
import {
  useFellowshipDcaStatus,
  type HydrationDcaStatus,
  type CollectivesReturnStatus,
} from '../api/dca-status';
import { DECIMALS, TIMING } from '../api/constants';

function formatDot(amount: bigint): string {
  const divisor = 10n ** BigInt(DECIMALS.DOT);
  const whole = (amount / divisor).toLocaleString();
  const frac = (amount % divisor).toString().padStart(DECIMALS.DOT, '0').slice(0, 2);
  return `${whole}.${frac}`;
}

/** Human "~N min / hr / days" from a block delta, using the chain block time. */
function formatBlockDelta(blocks: number): string {
  const seconds = blocks * TIMING.BLOCK_TIME_SECONDS;
  if (seconds < 3600) return `~${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `~${(seconds / 3600).toFixed(1)} hr`;
  return `~${(seconds / 86_400).toFixed(1)} days`;
}

export function DcaStatus() {
  const { hydration, collectives, loading, error } = useFellowshipDcaStatus('polkadot');

  const active =
    (hydration?.schedules.length ?? 0) > 0 || (collectives?.returns.length ?? 0) > 0;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold text-primary">Active Fellowship DCA</h2>
          {error ? (
            <span className="text-xs text-tertiary">Status unavailable</span>
          ) : !loading ? (
            <span className="text-xs text-tertiary">
              {active ? 'Ongoing DCA detected' : 'No ongoing DCA'}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HydrationColumn status={hydration} loading={loading} />
          <CollectivesColumn status={collectives} loading={loading} />
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-nested rounded-nested p-4">
      <p className="text-xs text-tertiary uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Skeleton() {
  return <span className="inline-block h-4 w-32 bg-surface-container rounded animate-pulse" />;
}

function HydrationColumn({
  status,
  loading,
}: {
  status: HydrationDcaStatus | null;
  loading: boolean;
}) {
  return (
    <ColumnShell title="Hydration — DCA trades">
      {loading && !status ? (
        <Skeleton />
      ) : !status || status.schedules.length === 0 ? (
        <span className="text-sm text-secondary">No active DCA on Hydration</span>
      ) : (
        <>
          <p className="text-sm text-secondary tabular-nums">
            <span className="text-primary font-medium">{formatDot(status.dotRemaining)} DOT</span>{' '}
            left to convert
          </p>
          {status.schedules.map((s) => {
            const blocksAway =
              s.nextExecutionBlock != null ? s.nextExecutionBlock - status.currentBlock : null;
            return (
              <div key={s.id} className="text-sm text-secondary space-y-0.5">
                <p className="text-primary font-medium tabular-nums">
                  <span className="text-tertiary font-normal">DCA #{s.id} · </span>
                  {formatDot(s.amountPerTrade)} DOT → HOLLAR
                  <span className="text-tertiary font-normal">
                    {' '}every {formatBlockDelta(s.period)}
                  </span>
                </p>
                {blocksAway != null && blocksAway > 0 && (
                  <p className="text-tertiary tabular-nums">
                    next in {formatBlockDelta(blocksAway)}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}
    </ColumnShell>
  );
}

function CollectivesColumn({
  status,
  loading,
}: {
  status: CollectivesReturnStatus | null;
  loading: boolean;
}) {
  return (
    <ColumnShell title="Collectives — scheduled returns">
      {loading && !status ? (
        <Skeleton />
      ) : !status || status.returns.length === 0 ? (
        <span className="text-sm text-secondary">No scheduled returns</span>
      ) : (
        (() => {
          const next = status.returns[0];
          const blocksAway = next.block - status.currentBlock;
          // A periodic task is one agenda entry but `remaining` future runs; a
          // one-off task is a single cash-out. Sum to get the true count.
          const totalCashouts = status.returns.reduce(
            (n, r) => n + (r.remaining ?? 1),
            0,
          );
          return (
            <div className="text-sm text-secondary space-y-0.5">
              <p className="text-primary font-medium">
                {totalCashouts} scheduled cash-out{totalCashouts === 1 ? '' : 's'}
              </p>
              <p className="text-tertiary tabular-nums">
                next at block {next.block.toLocaleString()}
                {blocksAway > 0 ? ` (${formatBlockDelta(blocksAway)})` : ''}
                {next.periodBlocks != null
                  ? ` · every ${formatBlockDelta(next.periodBlocks)}`
                  : ''}
              </p>
            </div>
          );
        })()
      )}
    </ColumnShell>
  );
}
