/**
 * Asset Hub (DOT-AH) chain client
 * Provider is selected by `provider-mode`: smoldot light client or WS RPC.
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { getWsProvider } from 'polkadot-api/ws-provider';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadot_asset_hub } from 'polkadot-api/chains';
import { dotAh } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { getChainEndpoint } from '../constants';
import { updateConnectionStatus } from './connection-status';
import { addParachain } from './smoldot-manager';
import { getProviderMode, providerModeChange$ } from './provider-mode';

let assetHubClient: ReturnType<typeof createClient> | null = null;
let assetHubApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;

providerModeChange$.subscribe(() => disconnectAssetHub());

export async function getAssetHubClient(network: NetworkType) {
  if (!assetHubClient) {
    updateConnectionStatus('assetHub', 'connecting');

    try {
      const provider =
        getProviderMode() === 'ws'
          ? withPolkadotSdkCompat(getWsProvider(getChainEndpoint(network, 'ASSET_HUB')))
          : getSmProvider(await addParachain(polkadot_asset_hub, network));
      assetHubClient = createClient(provider);

      updateConnectionStatus('assetHub', 'connected');
    } catch (error) {
      updateConnectionStatus('assetHub', 'error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  return assetHubClient;
}

export async function getAssetHubApi(network: NetworkType) {
  if (!assetHubApi) {
    const client = await getAssetHubClient(network);
    assetHubApi = client.getTypedApi(dotAh);
  }
  return assetHubApi;
}

export function disconnectAssetHub() {
  if (assetHubClient) {
    assetHubClient.destroy();
    assetHubClient = null;
    assetHubApi = null;
    updateConnectionStatus('assetHub', 'disconnected');
  }
}
