/**
 * XCM Message Builders
 * Constructs XCM V4 messages for cross-chain operations
 */

import { base58 } from '@scure/base';
import { blake2b } from '@noble/hashes/blake2.js';
import type { NetworkType } from '../api/constants';
import {
  getParachainId,
  getHydrationAssetId,
  getAssetHubAssetId,
  ACCOUNTS,
} from '../api/constants';

/**
 * XCM V4 Types (simplified representations)
 * In production, these would come from polkadot-api descriptors
 */

export type XcmV4Location = {
  parents: number;
  interior:
    | { Here: null }
    | { X1: Array<XcmV4Junction> }
    | { X2: Array<XcmV4Junction> };
};

export type XcmV4Junction =
  | { Parachain: number }
  | { AccountId32: { network: null; id: Uint8Array } }
  | { GlobalConsensus: { Polkadot: null } | { Paseo: null } };

export type XcmV4Asset = {
  id: XcmV4AssetId;
  fun: { Fungible: bigint };
};

export type XcmV4AssetId =
  | { Concrete: XcmV4Location }
  | { Abstract: Uint8Array };

export type XcmV4AssetFilter =
  | { Definite: Array<XcmV4Asset> }
  | { Wild: { AllCounted: number } | { All: null } };

export type XcmV4Instruction =
  | { WithdrawAsset: Array<XcmV4Asset> }
  | { ReserveAssetDeposited: Array<XcmV4Asset> }
  | { ReceiveTeleportedAsset: Array<XcmV4Asset> }
  | { PayFees: { asset: XcmV4Asset } }
  | { BuyExecution: { fees: XcmV4Asset; weight_limit: { Unlimited: null } | { Limited: bigint } } }
  | { DepositAsset: { assets: XcmV4AssetFilter; beneficiary: XcmV4Location } }
  | { DepositReserveAsset: { assets: XcmV4AssetFilter; dest: XcmV4Location; xcm: Array<XcmV4Instruction> } }
  | { InitiateReserveWithdraw: { assets: XcmV4AssetFilter; reserve: XcmV4Location; xcm: Array<XcmV4Instruction> } }
  | { Transact: { origin_kind: string; require_weight_at_most: { ref_time: bigint; proof_size: bigint }; call: Uint8Array } }
  | { AliasOrigin: XcmV4Location }
  | { ClearOrigin: null };

export type XcmVersionedXcm =
  | { V4: Array<XcmV4Instruction> };

/**
 * Helper: Create a parachain location
 */
export function parachainLocation(parachainId: number): XcmV4Location {
  return {
    parents: 1,
    interior: { X1: [{ Parachain: parachainId }] },
  };
}

/**
 * Helper: Create an account location on a parachain
 */
export function accountOnParachainLocation(
  parachainId: number,
  accountId: Uint8Array
): XcmV4Location {
  return {
    parents: 1,
    interior: {
      X2: [
        { Parachain: parachainId },
        { AccountId32: { network: null, id: accountId } },
      ],
    },
  };
}

/**
 * Helper: Create DOT asset on Hydration
 */
export function dotAssetOnHydration(network: NetworkType): XcmV4Asset {
  const assetId = getHydrationAssetId(network, 'DOT');
  return {
    id: {
      Concrete: {
        parents: 0,
        interior: { X1: [{ Parachain: assetId }] }, // Simplified - actual structure may vary
      },
    },
    fun: { Fungible: 0n }, // Amount set separately
  };
}

/**
 * Helper: Create USDT asset
 */
export function usdtAsset(network: NetworkType, amount: bigint, onHydration: boolean): XcmV4Asset {
  const assetId = onHydration
    ? getHydrationAssetId(network, 'USDT')
    : getAssetHubAssetId(network, 'USDT');

  return {
    id: {
      Concrete: {
        parents: 0,
        interior: { X1: [{ Parachain: assetId as number }] },
      },
    },
    fun: { Fungible: amount },
  };
}

/**
 * Helper: Create USDC asset
 */
export function usdcAsset(network: NetworkType, amount: bigint, onHydration: boolean): XcmV4Asset {
  const assetId = onHydration
    ? getHydrationAssetId(network, 'USDC')
    : getAssetHubAssetId(network, 'USDC');

  return {
    id: {
      Concrete: {
        parents: 0,
        interior: { X1: [{ Parachain: assetId as number }] },
      },
    },
    fun: { Fungible: amount },
  };
}

/**
 * Helper: Decode SS58 account address to Uint8Array (public key)
 * Uses the same approach as polkadot-api
 */
export function decodeAddress(address: string): Uint8Array {
  const SS58_PREFIX = new TextEncoder().encode('SS58PRE');
  const CHECKSUM_LENGTH = 2;

  try {
    const decoded = base58.decode(address);
    const prefixBytes = decoded.subarray(0, decoded[0] & 0b0100_0000 ? 2 : 1);
    const publicKey = decoded.subarray(
      prefixBytes.length,
      decoded.length - CHECKSUM_LENGTH,
    );

    const checksum = decoded.subarray(prefixBytes.length + publicKey.length);
    const expectedChecksum = blake2b(
      Uint8Array.of(...SS58_PREFIX, ...prefixBytes, ...publicKey),
      { dkLen: 64 },
    ).subarray(0, CHECKSUM_LENGTH);

    const isChecksumValid =
      checksum[0] === expectedChecksum[0] && checksum[1] === expectedChecksum[1];

    if (!isChecksumValid) {
      throw new Error('Invalid SS58 address checksum');
    }

    return publicKey.slice();
  } catch (error) {
    throw new Error(`Failed to decode SS58 address: ${error}`);
  }
}

/**
 * Build XCM to send DOT from Asset Hub treasury to Hydration
 * This transfers DOT to the Collectives sovereign account on Hydration
 */
export function buildTreasuryToHydrationXcm(
  network: NetworkType,
  dotAmount: bigint,
  feeAmount: bigint
): XcmVersionedXcm {
  const hydrationParaId = getParachainId(network, 'HYDRATION');
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  return {
    V4: [
      // 1. Withdraw DOT from treasury
      {
        WithdrawAsset: [
          {
            id: { Concrete: { parents: 0, interior: { Here: null } } }, // Native DOT
            fun: { Fungible: dotAmount + feeAmount },
          },
        ],
      },

      // 2. Pay fees on Asset Hub
      {
        PayFees: {
          asset: {
            id: { Concrete: { parents: 0, interior: { Here: null } } },
            fun: { Fungible: feeAmount / 4n }, // Reserve some for later
          },
        },
      },

      // 3. Deposit reserve asset to Hydration
      {
        DepositReserveAsset: {
          assets: { Wild: { AllCounted: 1 } },
          dest: parachainLocation(hydrationParaId),
          xcm: [
            // On Hydration: buy execution
            {
              BuyExecution: {
                fees: {
                  id: { Concrete: { parents: 0, interior: { Here: null } } },
                  fun: { Fungible: feeAmount / 4n },
                },
                weight_limit: { Unlimited: null },
              },
            },

            // Deposit to Collectives sovereign account
            {
              DepositAsset: {
                assets: { Wild: { AllCounted: 1 } },
                beneficiary: parachainLocation(collectivesParaId),
              },
            },
          ],
        },
      },
    ],
  };
}

/**
 * Build XCM to schedule DCA on Hydration
 * This is sent from Asset Hub scheduler to Hydration after warm-up period
 */
export function buildDcaScheduleXcm(
  network: NetworkType,
  dcaCallEncoded: Uint8Array,
  feeAmount: bigint
): XcmVersionedXcm {
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  return {
    V4: [
      // 1. Withdraw fee payment from sovereign account
      {
        WithdrawAsset: [
          {
            id: { Concrete: { parents: 0, interior: { Here: null } } },
            fun: { Fungible: feeAmount },
          },
        ],
      },

      // 2. Buy execution
      {
        BuyExecution: {
          fees: {
            id: { Concrete: { parents: 0, interior: { Here: null } } },
            fun: { Fungible: feeAmount },
          },
          weight_limit: { Unlimited: null },
        },
      },

      // 3. Change origin to Collectives sovereign account
      {
        AliasOrigin: parachainLocation(collectivesParaId),
      },

      // 4. Execute DCA.schedule call
      {
        Transact: {
          origin_kind: 'SovereignAccount',
          require_weight_at_most: {
            ref_time: 1000000000n,
            proof_size: 64000n,
          },
          call: dcaCallEncoded,
        },
      },
    ],
  };
}

/**
 * Build XCM for periodic return with automatic 70/30 split
 * This transfers stablecoins from Hydration back to Asset Hub
 * with automatic split to Fellowship Treasury (70%) and Salary (30%)
 */
export function buildPeriodicReturnXcm(
  network: NetworkType,
  usdtAmount: bigint,
  usdcAmount: bigint,
  feeAmount: bigint
): XcmVersionedXcm {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  // Calculate split amounts (70/30)
  const usdtTreasury = (usdtAmount * 70n) / 100n;
  const usdcTreasury = (usdcAmount * 70n) / 100n;

  // Decode Fellowship addresses
  const fellowshipTreasuryId = decodeAddress(ACCOUNTS.FELLOWSHIP_TREASURY);
  const fellowshipSalaryId = decodeAddress(ACCOUNTS.FELLOWSHIP_SALARY);

  return {
    V4: [
      // 1. Withdraw stables from Collectives sovereign account on Hydration
      {
        WithdrawAsset: [
          usdtAsset(network, usdtAmount, true),
          usdcAsset(network, usdcAmount, true),
        ],
      },

      // 2. Pay fees on Hydration
      {
        BuyExecution: {
          fees: usdtAsset(network, feeAmount, true),
          weight_limit: { Unlimited: null },
        },
      },

      // 3. Change origin to sovereign account
      {
        AliasOrigin: parachainLocation(collectivesParaId),
      },

      // 4. Initiate reserve withdraw back to Asset Hub with nested instructions
      {
        InitiateReserveWithdraw: {
          assets: { Wild: { AllCounted: 2 } },
          reserve: parachainLocation(assetHubParaId),
          xcm: [
            // On Asset Hub: Clear origin
            { ClearOrigin: null },

            // Pay fees on Asset Hub
            {
              BuyExecution: {
                fees: usdtAsset(network, feeAmount, false),
                weight_limit: { Unlimited: null },
              },
            },

            // Deposit 70% to Fellowship Treasury
            {
              DepositAsset: {
                assets: {
                  Definite: [
                    usdtAsset(network, usdtTreasury, false),
                    usdcAsset(network, usdcTreasury, false),
                  ],
                },
                beneficiary: accountOnParachainLocation(assetHubParaId, fellowshipTreasuryId),
              },
            },

            // Deposit remaining 30% to Fellowship Salary
            {
              DepositAsset: {
                assets: { Wild: { AllCounted: 2 } },
                beneficiary: accountOnParachainLocation(assetHubParaId, fellowshipSalaryId),
              },
            },
          ],
        },
      },
    ],
  };
}
