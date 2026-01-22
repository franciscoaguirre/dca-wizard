/**
 * Asset Hub (DOT-AH) chain client
 * Handles connections and operations for Polkadot/Paseo Asset Hub
 * Uses smoldot light client with webworker
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { startFromWorker } from 'polkadot-api/smoldot/from-worker';
import SmWorker from 'polkadot-api/smoldot/worker?worker';
import { polkadot, polkadot_asset_hub } from 'polkadot-api/chains';
import { dotAh } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { updateConnectionStatus } from './connection-status';

let assetHubClient: ReturnType<typeof createClient> | null = null;
let assetHubApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;
let smoldotInstance: Awaited<ReturnType<typeof startFromWorker>> | null = null;

async function initSmoldot() {
  if (!smoldotInstance) {
    smoldotInstance = startFromWorker(new SmWorker());
  }
  return smoldotInstance;
}

export async function getAssetHubClient(network: NetworkType) {
  if (!assetHubClient) {
    updateConnectionStatus('assetHub', 'connecting');

    try {
      const smoldot = await initSmoldot();

      // For now, only support Polkadot mainnet
      // TODO: Add Paseo support when needed
      if (network !== 'polkadot') {
        throw new Error('Only Polkadot mainnet is supported via smoldot light client currently');
      }

      // Add relay chain first
      const relayChain = await smoldot.addChain({ chainSpec: polkadot });

      // Add Asset Hub as parachain
      const assetHubChain = await smoldot.addChain({
        chainSpec: polkadot_asset_hub,
        potentialRelayChains: [relayChain],
      });

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
