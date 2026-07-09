/**
 * Treasury & Salary on-chain balance snapshot.
 * Shows live DOT/USDT/USDC/HOLLAR balances on Asset Hub for both accounts.
 */

import { Card, CardContent } from './ui/card';
import { useTreasuryBalances, type AccountBalances } from '../api/treasury-balances';
import { DECIMALS } from '../api/constants';

const ASSET_ROWS: Array<{ key: keyof AccountBalances; label: string; decimals: number }> = [
  { key: 'dot', label: 'DOT', decimals: DECIMALS.DOT },
  { key: 'usdt', label: 'USDT', decimals: DECIMALS.USDT },
  { key: 'usdc', label: 'USDC', decimals: DECIMALS.USDC },
  { key: 'hollar', label: 'HOLLAR', decimals: DECIMALS.HOLLAR },
];

function formatBalance(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const wholeStr = whole.toLocaleString();
  if (frac === 0n) return wholeStr;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2);
  return `${wholeStr}.${fracStr}`;
}

export function TreasurySnapshot({ bare = false }: { bare?: boolean }) {
  const { mainTreasury, treasury, salary, loading, error } = useTreasuryBalances('polkadot');

  const body = (
    <>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold text-primary">Treasury balances</h2>
        {error && <span className="text-xs text-tertiary">Balances unavailable</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AccountColumn name="Main Treasury" balances={mainTreasury} loading={loading} />
        <AccountColumn name="Fellowship Treasury" balances={treasury} loading={loading} />
        <AccountColumn name="Fellowship Salary" balances={salary} loading={loading} />
      </div>
    </>
  );

  if (bare) return body;

  return (
    <Card>
      <CardContent className="pt-6">{body}</CardContent>
    </Card>
  );
}

interface AccountColumnProps {
  name: string;
  balances: AccountBalances | null;
  loading: boolean;
}

function AccountColumn({ name, balances, loading }: AccountColumnProps) {
  return (
    <div className="bg-surface-nested rounded-nested p-4">
      <p className="text-xs text-tertiary uppercase tracking-wide mb-3">{name}</p>
      <div className="space-y-2">
        {ASSET_ROWS.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between">
            <span className="text-sm text-secondary">{row.label}</span>
            {loading && !balances ? (
              <span className="inline-block h-4 w-20 bg-surface-container rounded animate-pulse" />
            ) : (
              <span className="text-sm font-medium text-primary tabular-nums">
                {formatBalance(balances?.[row.key] ?? 0n, row.decimals)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
