/**
 * Shared Smoldot Instance Manager
 * Manages a single smoldot instance and caches relay chain connections
 * to avoid creating multiple Web Workers
 */

import { startFromWorker } from 'polkadot-api/smoldot/from-worker';
import SmWorker from 'polkadot-api/smoldot/worker?worker';
import { polkadot } from 'polkadot-api/chains';
import type { NetworkType } from '../constants';

type SmoldotInstance = Awaited<ReturnType<typeof startFromWorker>>;
type ChainReference = Awaited<ReturnType<SmoldotInstance['addChain']>>;

let smoldotInstance: SmoldotInstance | null = null;
const relayChainCache = new Map<NetworkType, ChainReference>();

/**
 * Initialize or get the shared smoldot instance
 */
export async function initSmoldot(): Promise<SmoldotInstance> {
  if (!smoldotInstance) {
    smoldotInstance = startFromWorker(new SmWorker());
  }
  return smoldotInstance;
}

/**
 * Get the relay chain for a given network
 * Caches the relay chain connection for reuse
 */
export async function getRelayChain(network: NetworkType): Promise<ChainReference> {
  if (relayChainCache.has(network)) {
    return relayChainCache.get(network)!;
  }

  const smoldot = await initSmoldot();

  // For now, only support Polkadot mainnet
  if (network !== 'polkadot') {
    throw new Error('Only Polkadot mainnet is supported via smoldot light client currently');
  }

  const relayChain = await smoldot.addChain({ chainSpec: polkadot });
  relayChainCache.set(network, relayChain);

  return relayChain;
}

/**
 * Add a parachain using the shared relay chain
 */
export async function addParachain(
  chainSpec: string,
  network: NetworkType
): Promise<ChainReference> {
  const smoldot = await initSmoldot();
  const relayChain = await getRelayChain(network);

  return smoldot.addChain({
    chainSpec,
    potentialRelayChains: [relayChain],
  });
}

/**
 * Disconnect all chains and cleanup
 */
export function disconnectAll(): void {
  relayChainCache.clear();
  if (smoldotInstance) {
    smoldotInstance.terminate();
    smoldotInstance = null;
  }
}
