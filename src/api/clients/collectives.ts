/**
 * Collectives chain client
 * Handles connections and operations for Polkadot Collectives parachain
 * Uses shared smoldot light client instance
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { polkadot_collectives } from 'polkadot-api/chains';
import { collectives } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { updateConnectionStatus } from './connection-status';
import { addParachain } from './smoldot-manager';

let collectivesClient: ReturnType<typeof createClient> | null = null;
let collectivesApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;

export async function getCollectivesClient(network: NetworkType) {
  if (!collectivesClient) {
    updateConnectionStatus('collectives', 'connecting');

    try {
      const collectivesChain = await addParachain(polkadot_collectives, network);
      const provider = getSmProvider(collectivesChain);
      collectivesClient = createClient(provider);

      updateConnectionStatus('collectives', 'connected');
    } catch (error) {
      updateConnectionStatus('collectives', 'error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  return collectivesClient;
}

export async function getCollectivesApi(network: NetworkType) {
  if (!collectivesApi) {
    const client = await getCollectivesClient(network);
    collectivesApi = client.getTypedApi(collectives);
  }
  return collectivesApi;
}

export function disconnectCollectives() {
  if (collectivesClient) {
    collectivesClient.destroy();
    collectivesClient = null;
    collectivesApi = null;
    updateConnectionStatus('collectives', 'disconnected');
  }
}
