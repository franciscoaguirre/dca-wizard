/**
 * Asset Hub (DOT-AH) chain client
 * Handles connections and operations for Polkadot/Paseo Asset Hub
 * Uses shared smoldot light client instance
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { polkadot_asset_hub } from 'polkadot-api/chains';
import { dotAh } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { updateConnectionStatus } from './connection-status';
import { addParachain } from './smoldot-manager';

let assetHubClient: ReturnType<typeof createClient> | null = null;
let assetHubApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;

export async function getAssetHubClient(network: NetworkType) {
  if (!assetHubClient) {
    updateConnectionStatus('assetHub', 'connecting');

    try {
      // Use shared smoldot manager to add Asset Hub parachain
      const assetHubChain = await addParachain(polkadot_asset_hub, network);

      // Create client with smoldot provider
      const provider = getSmProvider(assetHubChain);
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
