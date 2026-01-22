/**
 * Hydration chain client
 * Handles connections and operations for Hydration parachain
 * Uses smoldot light client with webworker
 */

import { createClient } from 'polkadot-api';
import { getSmProvider } from 'polkadot-api/sm-provider';
import { startFromWorker } from 'polkadot-api/smoldot/from-worker';
import SmWorker from 'polkadot-api/smoldot/worker?worker';
import { polkadot } from 'polkadot-api/chains';
import { hydration } from '../../../.papi/descriptors/dist';
import type { NetworkType } from '../constants';
import { updateConnectionStatus } from './connection-status';

let hydrationClient: ReturnType<typeof createClient> | null = null;
let hydrationApi: ReturnType<ReturnType<typeof createClient>['getTypedApi']> | null = null;
let smoldotInstance: Awaited<ReturnType<typeof startFromWorker>> | null = null;

// Lightweight Hydration chainspec for smoldot
const HYDRATION_CHAINSPEC = JSON.stringify({
  name: "Hydration",
  id: "hydra",
  chainType: "Live",
  bootNodes: [
    "/dns/p2p-01.hydra.hydradx.io/tcp/30333/p2p/12D3KooWHzv7XVVBwY4EX1aKJBU6qzEjqGk6XtoFagr5wEXx6MsH",
    "/dns/p2p-02.hydra.hydradx.io/tcp/30333/p2p/12D3KooWR72FwHrkGNTNes6U5UHQezWLmrKu6b45MvcnRGK8J3S6",
    "/dns/p2p-03.hydra.hydradx.io/tcp/30333/p2p/12D3KooWFDwxZinAjgmLVgsideCmdB2bz911YgiQdLEiwKovezUz",
    "/dns4/boot.helikon.io/tcp/15120/p2p/12D3KooWDcQY1L2ny3F7YPyP4snCZZYc4eKWgPLEzdBvWBUjH5Yt",
    "/dns4/boot.helikon.io/tcp/15125/wss/p2p/12D3KooWDcQY1L2ny3F7YPyP4snCZZYc4eKWgPLEzdBvWBUjH5Yt",
    "/dns/hydration.boot.stake.plus/tcp/30332/wss/p2p/12D3KooWGZaDfqPyzVxhA3k1qv72P7xqYTJS8W9U7GWUEdXYhtUU",
    "/dns/hydration.boot.stake.plus/tcp/31332/wss/p2p/12D3KooWBJMG8LCh6pLYbGapA3SNzjhQWE87ieGux41jKQrrf5js",
    "/dns/hydration-bootnode.radiumblock.com/tcp/30333/p2p/12D3KooWCtrMH4H2p5XkGHkU7K4CcbSmErouNuN3j7Bysj4a8hJX",
    "/dns/hydration-bootnode.radiumblock.com/tcp/30336/wss/p2p/12D3KooWCtrMH4H2p5XkGHkU7K4CcbSmErouNuN3j7Bysj4a8hJX",
  ],
  properties: { tokenDecimals: 12, tokenSymbol: "HDX" },
  relay_chain: "polkadot",
  para_id: 2034,
  consensusEngine: null,
  codeSubstitutes: {},
  genesis: {
    stateRootHash:
      "0x33a542156b00e7dd467e2b7704563abd84f888ccbc6afd6f1a1802a55db1d4de",
  },
});

async function initSmoldot() {
  if (!smoldotInstance) {
    smoldotInstance = startFromWorker(new SmWorker());
  }
  return smoldotInstance;
}

export async function getHydrationClient(network: NetworkType) {
  if (!hydrationClient) {
    updateConnectionStatus('hydration', 'connecting');

    try {
      const smoldot = await initSmoldot();

      // For now, only support Polkadot mainnet
      if (network !== 'polkadot') {
        throw new Error('Only Polkadot mainnet is supported via smoldot light client currently');
      }

      // Add relay chain first
      const relayChain = await smoldot.addChain({ chainSpec: polkadot });

      // Add Hydration parachain with lightweight chainspec
      const hydrationChain = await smoldot.addChain({
        chainSpec: HYDRATION_CHAINSPEC,
        potentialRelayChains: [relayChain],
      });

      // Create client with smoldot provider
      const provider = getSmProvider(hydrationChain);
      hydrationClient = createClient(provider);

      updateConnectionStatus('hydration', 'connected');
    } catch (error) {
      updateConnectionStatus('hydration', 'error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  return hydrationClient;
}

export async function getHydrationApi(network: NetworkType) {
  if (!hydrationApi) {
    const client = await getHydrationClient(network);
    hydrationApi = client.getTypedApi(hydration);
  }
  return hydrationApi;
}

export function disconnectHydration() {
  if (hydrationClient) {
    hydrationClient.destroy();
    hydrationClient = null;
    hydrationApi = null;
    updateConnectionStatus('hydration', 'disconnected');
  }
}
