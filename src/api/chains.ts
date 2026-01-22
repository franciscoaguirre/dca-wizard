/**
 * Chain configurations for polkadot-api
 */

import type { NetworkType } from './constants';
import { getChainEndpoint } from './constants';

export interface ChainConfig {
  id: string;
  name: string;
  endpoint: string;
}

export function getChainConfigs(network: NetworkType): {
  relay: ChainConfig;
  assetHub: ChainConfig;
  hydration: ChainConfig;
} {
  return {
    relay: {
      id: network === 'polkadot' ? 'polkadot' : 'paseo',
      name: network === 'polkadot' ? 'Polkadot' : 'Paseo',
      endpoint: getChainEndpoint(network, 'RELAY'),
    },
    assetHub: {
      id: network === 'polkadot' ? 'polkadot_asset_hub' : 'paseo_asset_hub',
      name: network === 'polkadot' ? 'Polkadot Asset Hub' : 'Paseo Asset Hub',
      endpoint: getChainEndpoint(network, 'ASSET_HUB'),
    },
    hydration: {
      id: network === 'polkadot' ? 'hydration' : 'paseo_hydration',
      name: 'Hydration',
      endpoint: getChainEndpoint(network, 'HYDRATION'),
    },
  };
}
