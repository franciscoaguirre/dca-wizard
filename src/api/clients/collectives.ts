/**
 * Collectives chain client
 * Provider is selected by `provider-mode`: smoldot light client or WS RPC.
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadot_collectives } from 'polkadot-api/chains';
import { collectives } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { getChainEndpoint } from '../constants';
import { updateConnectionStatus } from './connection-status';
import { addParachain } from './smoldot-manager';
import { getProviderMode, providerModeChange$ } from './provider-mode';

let collectivesClient: ReturnType<typeof createClient> | null = null;
let collectivesApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;

providerModeChange$.subscribe(() => disconnectCollectives());

export async function getCollectivesClient(network: NetworkType) {
  if (!collectivesClient) {
    updateConnectionStatus('collectives', 'connecting');

    try {
      const provider =
        getProviderMode() === 'ws'
          ? withPolkadotSdkCompat(getWsProvider(getChainEndpoint(network, 'COLLECTIVES')))
          : getSmProvider(await addParachain(polkadot_collectives, network));
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
