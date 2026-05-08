/**
 * Provider mode: choose between smoldot light client (default) and a direct
 * WebSocket RPC. Persisted to localStorage so the choice survives reloads.
 *
 * On change, all chain client modules disconnect themselves; the next caller
 * to `getXxxApi()` recreates the client with the new provider.
 */

import { BehaviorSubject, Subject } from 'rxjs';

export type ProviderMode = 'smoldot' | 'ws';

const STORAGE_KEY = 'dca-wizard:provider-mode';

function readInitialMode(): ProviderMode {
  if (typeof window === 'undefined') return 'smoldot';
  return window.localStorage.getItem(STORAGE_KEY) === 'ws' ? 'ws' : 'smoldot';
}

const mode$ = new BehaviorSubject<ProviderMode>(readInitialMode());
const change$ = new Subject<ProviderMode>();

export function getProviderMode(): ProviderMode {
  return mode$.value;
}

/** Replays the current mode + emits on every change. UI subscribes to this. */
export const providerMode$ = mode$.asObservable();

/** Fires only on actual changes (no replay). Clients subscribe to this to disconnect. */
export const providerModeChange$ = change$.asObservable();

export function setProviderMode(mode: ProviderMode): void {
  if (mode === mode$.value) return;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }
  mode$.next(mode);
  change$.next(mode);
}
