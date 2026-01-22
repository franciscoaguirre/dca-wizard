/**
 * Hydration chain client
 * Handles connections and operations for Hydration parachain
 */

import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import type { NetworkType } from '../constants';
import { getChainEndpoint } from '../constants';

let hydrationClient: ReturnType<typeof createClient> | null = null;

export function getHydrationClient(network: NetworkType) {
  if (!hydrationClient) {
    const endpoint = getChainEndpoint(network, 'HYDRATION');
    const provider = getWsProvider(endpoint);
    hydrationClient = createClient(provider);
  }
  return hydrationClient;
}

export function disconnectHydration() {
  if (hydrationClient) {
    hydrationClient.destroy();
    hydrationClient = null;
  }
}
