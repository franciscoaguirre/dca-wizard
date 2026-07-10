/**
 * Fellowship Treasury & Salary balance queries.
 * Reads DOT, USDT, USDC, and HOLLAR balances on Asset Hub for both accounts.
 */

import { useEffect, useState } from 'react';
import { ACCOUNTS, ASSET_HUB_ASSETS, type NetworkType } from './constants';
import { getAssetHubApi } from './clients/dotAh';
import { hollarAssetIdV5 } from '../governance/xcm-messages';

export interface AccountBalances {
  dot: bigint;
  usdt: bigint;
  usdc: bigint;
  hollar: bigint;
}

export interface TreasuryBalancesResult {
  mainTreasury: AccountBalances | null;
  treasury: AccountBalances | null;
  salary: AccountBalances | null;
  loading: boolean;
  error: string | null;
}

const ZERO: AccountBalances = { dot: 0n, usdt: 0n, usdc: 0n, hollar: 0n };
const REFRESH_MS = 30_000;

async function fetchAccountBalances(
  network: NetworkType,
  address: string,
): Promise<AccountBalances> {
  const api = await getAssetHubApi(network);
  const usdtId = ASSET_HUB_ASSETS[network].USDT;
  const usdcId = ASSET_HUB_ASSETS[network].USDC;
  const hollarKey = hollarAssetIdV5(network);

  const [system, usdt, usdc, hollar] = await Promise.all([
    api.query.System.Account.getValue(address),
    api.query.Assets.Account.getValue(usdtId, address),
    api.query.Assets.Account.getValue(usdcId, address),
    api.query.ForeignAssets.Account.getValue(hollarKey, address),
  ]);

  return {
    dot: system?.data?.free ?? 0n,
    usdt: usdt?.balance ?? 0n,
    usdc: usdc?.balance ?? 0n,
    hollar: hollar?.balance ?? 0n,
  };
}

export function useTreasuryBalances(network: NetworkType): TreasuryBalancesResult {
  const [mainTreasury, setMainTreasury] = useState<AccountBalances | null>(null);
  const [treasury, setTreasury] = useState<AccountBalances | null>(null);
  const [salary, setSalary] = useState<AccountBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [m, t, s] = await Promise.all([
          fetchAccountBalances(network, ACCOUNTS.MAIN_TREASURY),
          fetchAccountBalances(network, ACCOUNTS.FELLOWSHIP_TREASURY),
          fetchAccountBalances(network, ACCOUNTS.FELLOWSHIP_SALARY),
        ]);
        if (cancelled) return;
        setMainTreasury(m);
        setTreasury(t);
        setSalary(s);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setMainTreasury((prev) => prev ?? ZERO);
        setTreasury((prev) => prev ?? ZERO);
        setSalary((prev) => prev ?? ZERO);
        setError(e instanceof Error ? e.message : 'Failed to load balances');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [network]);

  return { mainTreasury, treasury, salary, loading, error };
}
