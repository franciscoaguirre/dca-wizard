/**
 * Core constants for DCA Wizard
 * Includes network configurations, account addresses, asset IDs, and timing constants
 */

// Network Type
export type NetworkType = 'polkadot' | 'paseo';

// Proposal Mode: which subset of calls the wizard emits.
// - setup:  single combined V5 XCM (transfer DOT + start DCA in one Hydration entry)  (1 call)
// - return: scheduled periodic-return XCM only                                         (1 call)
// - both:   setup + scheduled periodic returns wrapped in Utility.batch_all            (2 calls)
export type ProposalMode = 'setup' | 'return' | 'both';

// Proposal Origin: which treasury funds the DCA and therefore which referendum
// track authorizes it.
// - treasury:   main Polkadot Treasury → OpenGov Root referendum on Asset Hub
// - fellowship: Fellowship sub-treasury → Collectives Architects referendum
export type ProposalOrigin = 'treasury' | 'fellowship';

// Account Addresses
export const ACCOUNTS = {
  FELLOWSHIP_TREASURY: '16VcQSRcMFy6ZHVjBvosKmo7FKqTb8ZATChDYo8ibutzLnos',
  FELLOWSHIP_SALARY: '13w7NdvSR1Af8xsQTArDtZmVvjE8XhWNdL4yed3iFHrUNCnS',
  // Polkadot Treasury pallet account ("py/trsry"). Same account bytes on Asset
  // Hub post-AHM. Verify against chain before mainnet submission.
  MAIN_TREASURY: '13UVJyLnbVp9RBZYFwFGyDvVd1y27Tt8tkntv6Q7JVPhFsTB',
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

// Asset IDs on Asset Hub.
// HOLLAR is a foreign asset referenced by its multilocation
// (parents=1, X2(Parachain(2034), GeneralIndex(222))), not by a local numeric id.
// USDT (1984) and USDC (1337) are the canonical Asset Hub stablecoin asset ids.
export const ASSET_HUB_ASSETS = {
  polkadot: {
    DOT: 'native', // Native asset
    USDT: 1984,
    USDC: 1337,
  },
  paseo: {
    DOT: 'native',
    USDT: 0, // TODO: Look up actual Paseo USDT asset id
    USDC: 0, // TODO: Look up actual Paseo USDC asset id
  },
} as const;

// Asset IDs on Hydration
export const HYDRATION_ASSETS = {
  polkadot: {
    DOT: 5,
    HOLLAR: 222,
  },
  paseo: {
    DOT: 0, // TODO: Look up actual testnet asset ID
    HOLLAR: 0, // TODO: Confirm Paseo Hydration HOLLAR asset id
  },
} as const;

// Asset Decimals
export const DECIMALS = {
  DOT: 10,
  HOLLAR: 18,
  USDT: 6,
  USDC: 6,
} as const;

// Timing Constants
export const TIMING = {
  BLOCK_TIME_SECONDS: 6,
  BLOCKS_PER_DAY: 14400, // 24 * 60 * 60 / 6
} as const;

// Default Values
export const DEFAULTS = {
  DCA_FREQUENCY_BLOCKS: 100, // ~10 minutes
  DCA_DURATION_DAYS: 30,
  SLIPPAGE_PERCENT: 1,
  TREASURY_SPLIT_PERCENT: 70,
  FEE_BUFFER_PERCENT: 10,
  RETURN_FREQUENCY_DAYS: 7,
  NUMBER_OF_RETURNS: 4,
  // Margin shaved off each rate-based return amount to absorb DCA price drift,
  // execution slippage, and timing skew between trade settlement and return.
  RETURN_BUFFER_PERCENT: 5,
} as const;

// Conservative per-hop XCM fee budget on Asset Hub / Hydration (10 decimals → 0.05 DOT).
// Embedded in PayFees / WithdrawAsset on each hop and used for proposal-level estimates.
export const PER_HOP_FEE_PLANCK = BigInt(5e8);

// DCA Parameters
export const DCA_CONFIG = {
  MAX_RETRIES: 10,
  STABILITY_THRESHOLD_PERCENT: 2,
  MIN_SLIPPAGE_PERCENT: 0.1,
  MAX_SLIPPAGE_PERCENT: 10,
  // Headroom on `min_amount_out` to tolerate DOT price decline over the schedule's
  // lifetime. Per-trade execution slippage is still enforced via the `slippage`
  // field; this buffer is the absolute floor against the proposal-time price.
  PRICE_DECLINE_BUFFER_PERCENT: 50,
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
    HYDRATION: 'wss://hydration-rpc.n.dwellir.com',
    COLLECTIVES: 'wss://polkadot-collectives-rpc.polkadot.io',
  },
  paseo: {
    RELAY: 'wss://paseo.rpc.amforc.com',
    ASSET_HUB: 'wss://paseo-asset-hub-rpc.polkadot.io',
    HYDRATION: 'wss://paseo.rpc.hydration.cloud', // TODO: Verify actual endpoint
    COLLECTIVES: 'wss://paseo-collectives-rpc.polkadot.io', // TODO: Verify actual endpoint
  },
} as const;

// Helper function to get asset ID by network and chain
export function getAssetHubAssetId(
  network: NetworkType,
  asset: 'DOT'
): number | 'native' {
  return ASSET_HUB_ASSETS[network][asset];
}

export function getHydrationAssetId(
  network: NetworkType,
  asset: 'DOT' | 'HOLLAR'
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

// Format HOLLAR amount with proper decimals (18)
export function formatHollarAmount(amount: bigint): string {
  const divisor = 10n ** BigInt(DECIMALS.HOLLAR);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  return `${whole}.${fraction.toString().padStart(DECIMALS.HOLLAR, '0')} HOLLAR`;
}

// Parse DOT amount from string
export function parseDotAmount(amount: string): bigint {
  const [whole = '0', fraction = '0'] = amount.split('.');
  const paddedFraction = fraction.padEnd(DECIMALS.DOT, '0').slice(0, DECIMALS.DOT);
  return BigInt(whole) * BigInt(10 ** DECIMALS.DOT) + BigInt(paddedFraction);
}

// Parse HOLLAR amount from string (18 decimals; pure bigint path for precision)
export function parseHollarAmount(amount: string): bigint {
  const [whole = '0', fraction = '0'] = amount.split('.');
  const paddedFraction = fraction.padEnd(DECIMALS.HOLLAR, '0').slice(0, DECIMALS.HOLLAR);
  return BigInt(whole) * 10n ** BigInt(DECIMALS.HOLLAR) + BigInt(paddedFraction);
}
