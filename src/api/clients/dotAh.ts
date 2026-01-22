/**
 * Asset Hub (DOT-AH) chain client
 * Handles connections and operations for Polkadot/Paseo Asset Hub
 */

import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import type { NetworkType } from '../constants';
import { getChainEndpoint } from '../constants';

let assetHubClient: ReturnType<typeof createClient> | null = null;

export function getAssetHubClient(network: NetworkType) {
  if (!assetHubClient) {
    const endpoint = getChainEndpoint(network, 'ASSET_HUB');
    const provider = getWsProvider(endpoint);
    assetHubClient = createClient(provider);
  }
  return assetHubClient;
}

export function disconnectAssetHub() {
  if (assetHubClient) {
    assetHubClient.destroy();
    assetHubClient = null;
  }
}
