/**
 * Core constants for DCA Wizard
 * Includes network configurations, account addresses, asset IDs, and timing constants
 */

// Network Type
export type NetworkType = 'polkadot' | 'paseo';

// Account Addresses
export const ACCOUNTS = {
  FELLOWSHIP_TREASURY: '16VcQSRcMFy6ZHVjBvosKmo7FKqTb8ZATChDYo8ibutzLnos',
  FELLOWSHIP_SALARY: '13w7NdvSR1Af8xsQTArDtZmVvjE8XhWNdL4yed3iFHrUNCnS',
} as const;

// Fellowship pallet indices on Collectives chain
export const FELLOWSHIP_TREASURY_PALLET_INDEX = 65;
export const FELLOWSHIP_SALARY_PALLET_INDEX = 64;

// Parachain IDs
export const PARACHAIN_IDS = {
  polkadot: {
    ASSET_HUB: 1000,
    HYDRATION: 2034,
    COLLECTIVES: 1001, // Fellowship parachain
  },
  paseo: {
    ASSET_HUB: 1000,
    HYDRATION: 0, // TODO: Look up actual Paseo Hydration parachain ID
    COLLECTIVES: 0, // TODO: Look up actual Paseo Collectives parachain ID
  },
} as const;

// Asset IDs on Asset Hub
export const ASSET_HUB_ASSETS = {
  polkadot: {
    DOT: 'native', // Native asset
    USDT: 1984,
    USDC: 1337,
  },
  paseo: {
    DOT: 'native',
    USDT: 0, // TODO: Look up actual testnet asset ID
    USDC: 0, // TODO: Look up actual testnet asset ID
  },
} as const;

// Asset IDs on Hydration
export const HYDRATION_ASSETS = {
  polkadot: {
    DOT: 5,
    USDT: 10,
    USDC: 22,
  },
  paseo: {
    DOT: 0, // TODO: Look up actual testnet asset ID
    USDT: 0, // TODO: Look up actual testnet asset ID
    USDC: 0, // TODO: Look up actual testnet asset ID
  },
} as const;

// Asset Decimals
export const DECIMALS = {
  DOT: 10,
  USDT: 6,
  USDC: 6,
} as const;

// Timing Constants
export const TIMING = {
  BLOCK_TIME_SECONDS: 6,
  BLOCKS_PER_DAY: 14400, // 24 * 60 * 60 / 6
  WARM_UP_BLOCKS: 100, // ~10 minutes for DOT to arrive on Hydration
} as const;

// Default Values
export const DEFAULTS = {
  DCA_FREQUENCY_BLOCKS: 100, // ~10 minutes
  DCA_DURATION_DAYS: 30,
  SLIPPAGE_PERCENT: 1,
  TREASURY_SPLIT_PERCENT: 70,
  FEE_BUFFER_PERCENT: 10, // Extra DOT reserved for multi-hop fees
  RETURN_FREQUENCY_DAYS: 7,
  NUMBER_OF_RETURNS: 4, // default: 4 returns over 30 days
} as const;

// DCA Parameters
export const DCA_CONFIG = {
  MAX_RETRIES: 10,
  STABILITY_THRESHOLD_PERCENT: 2,
  MIN_SLIPPAGE_PERCENT: 0.1,
  MAX_SLIPPAGE_PERCENT: 10,
} as const;

// Validation Limits
export const VALIDATION = {
  MIN_DOT_AMOUNT: BigInt(100) * BigInt(10 ** DECIMALS.DOT), // 100 DOT minimum
  MIN_DCA_FREQUENCY_BLOCKS: 10,
  MIN_RETURNS: 1,
  MAX_RETURNS: 52,
} as const;

// Chain Endpoints (WebSocket)
export const CHAIN_ENDPOINTS = {
  polkadot: {
    RELAY: 'wss://polkadot-rpc.dwellir.com',
    ASSET_HUB: 'wss://polkadot-asset-hub-rpc.polkadot.io',
    HYDRATION: 'wss://rpc.hydradx.cloud',
    COLLECTIVES: 'wss://polkadot-collectives-rpc.polkadot.io',
  },
  paseo: {
    RELAY: 'wss://paseo.rpc.amforc.com',
    ASSET_HUB: 'wss://paseo-asset-hub-rpc.polkadot.io',
    HYDRATION: 'wss://paseo.rpc.hydration.cloud', // TODO: Verify actual endpoint
    COLLECTIVES: 'wss://paseo-collectives-rpc.polkadot.io', // TODO: Verify actual endpoint
  },
} as const;

// Stablecoin Options
export type StablecoinType = 'USDT' | 'USDC' | 'BOTH';

// Helper function to get asset ID by network and chain
export function getAssetHubAssetId(
  network: NetworkType,
  asset: 'DOT' | 'USDT' | 'USDC'
): number | 'native' {
  return ASSET_HUB_ASSETS[network][asset];
}

export function getHydrationAssetId(
  network: NetworkType,
  asset: 'DOT' | 'USDT' | 'USDC'
): number {
  return HYDRATION_ASSETS[network][asset];
}

export function getParachainId(
  network: NetworkType,
  parachain: 'ASSET_HUB' | 'HYDRATION' | 'COLLECTIVES'
): number {
  return PARACHAIN_IDS[network][parachain];
}

export function getChainEndpoint(
  network: NetworkType,
  chain: 'RELAY' | 'ASSET_HUB' | 'HYDRATION' | 'COLLECTIVES'
): string {
  return CHAIN_ENDPOINTS[network][chain];
}

// Convert days to blocks
export function daysToBlocks(days: number): number {
  return Math.floor(days * TIMING.BLOCKS_PER_DAY);
}

// Convert blocks to days
export function blocksToDays(blocks: number): number {
  return blocks / TIMING.BLOCKS_PER_DAY;
}

// Format DOT amount with proper decimals
export function formatDotAmount(amount: bigint): string {
  const divisor = BigInt(10 ** DECIMALS.DOT);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(DECIMALS.DOT, '0')} DOT`;
}

// Format stablecoin amount with proper decimals
export function formatStablecoinAmount(amount: bigint, coin: 'USDT' | 'USDC'): string {
  const decimals = DECIMALS[coin];
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, '0')} ${coin}`;
}

// Parse DOT amount from string
export function parseDotAmount(amount: string): bigint {
  const [whole = '0', fraction = '0'] = amount.split('.');
  const paddedFraction = fraction.padEnd(DECIMALS.DOT, '0').slice(0, DECIMALS.DOT);
  return BigInt(whole) * BigInt(10 ** DECIMALS.DOT) + BigInt(paddedFraction);
}
