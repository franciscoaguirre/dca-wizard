/**
 * Test constants for DCA Wizard Chopsticks testing
 */

// Chopsticks WebSocket ports (pre-spawned instances)
export const PORTS = {
  ASSET_HUB: 8000,
  HYDRATION: 8001,
  RELAY: 8002,
  COLLECTIVES: 8003,
} as const;

// Dev accounts
export const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

// Re-export constants from main codebase
export {
  ACCOUNTS,
  PARACHAIN_IDS,
  HYDRATION_ASSETS,
  DECIMALS,
  TIMING,
} from "../src/api/constants";

// Unit values for convenience
export const DOT_UNITS = 10_000_000_000n; // 10 decimals
export const HOLLAR_UNITS = 10n ** 18n; // 18 decimals

// Test-specific parameters
export const TEST_DOT_AMOUNT = 10_000n * DOT_UNITS; // 10,000 DOT for testing
export const TREASURY_FUND_AMOUNT = 1_000_000n * DOT_UNITS; // 1M DOT to fund treasury
