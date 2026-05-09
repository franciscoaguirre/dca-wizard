/**
 * Wallet (injected extension) discovery and connection.
 * Thin wrapper around polkadot-api's pjs-signer.
 */

import {
  connectInjectedExtension,
  getInjectedExtensions,
  type InjectedExtension,
  type InjectedPolkadotAccount,
} from 'polkadot-api/pjs-signer';

export type { InjectedExtension, InjectedPolkadotAccount };

export const DAPP_NAME = 'DCA Wizard';

export function listExtensions(): string[] {
  return getInjectedExtensions();
}

export async function connectExtension(name: string): Promise<InjectedExtension> {
  return connectInjectedExtension(name, DAPP_NAME);
}
