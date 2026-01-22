/**
 * XCM Message Builders
 * Constructs XCM V4/V5 messages for cross-chain operations
 */

import { base58 } from '@scure/base';
import { blake2b } from '@noble/hashes/blake2.js';
import {
  XcmVersionedXcm,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5AssetFilter,
  XcmV5WildAsset,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV2OriginKind,
} from '@polkadot-api/descriptors';
import { Binary } from 'polkadot-api';
import type { NetworkType } from '../api/constants';
import {
  getParachainId,
  getAssetHubAssetId,
  ACCOUNTS,
} from '../api/constants';

// Re-export XcmVersionedXcm for use in other modules
export type { XcmVersionedXcm };

/**
 * Helper: Create a parachain location
 */
export function parachainLocation(parachainId: number) {
  return {
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(parachainId)),
  };
}

/**
 * Helper: Create an account location on Asset Hub
 * Accepts SS58 address string
 */
export function accountOnAssetHub(accountIdBytes: Uint8Array) {
  return {
    parents: 0,
    interior: XcmV5Junctions.X1(
      XcmV5Junction.AccountId32({
        network: undefined,
        id: Binary.fromBytes(accountIdBytes),
      })
    ),
  };
}

/**
 * Helper: Create native DOT asset ID
 */
export const DOT_ASSET_ID = {
  parents: 0,
  interior: XcmV5Junctions.Here(),
};

/**
 * Helper: Create USDT asset ID on Asset Hub
 */
export function getUsdtAssetId(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDT');
  return {
    parents: 0,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.PalletInstance(50), // Assets pallet
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

/**
 * Helper: Create USDC asset ID on Asset Hub
 */
export function getUsdcAssetId(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDC');
  return {
    parents: 0,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.PalletInstance(50), // Assets pallet
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

/**
 * Helper: Create USDT asset ID from Hydration's perspective (coming from Asset Hub)
 */
export function getUsdtAssetIdFromHydration(network: NetworkType) {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const assetId = getAssetHubAssetId(network, 'USDT');
  return {
    parents: 1,
    interior: XcmV5Junctions.X3([
      XcmV5Junction.Parachain(assetHubParaId),
      XcmV5Junction.PalletInstance(50),
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

/**
 * Helper: Create USDC asset ID from Hydration's perspective
 */
export function getUsdcAssetIdFromHydration(network: NetworkType) {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const assetId = getAssetHubAssetId(network, 'USDC');
  return {
    parents: 1,
    interior: XcmV5Junctions.X3([
      XcmV5Junction.Parachain(assetHubParaId),
      XcmV5Junction.PalletInstance(50),
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
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

  return XcmVersionedXcm.V5([
    // 1. Withdraw DOT from treasury
    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(dotAmount + feeAmount),
      },
    ]),

    // 2. Pay fees on Asset Hub
    XcmV5Instruction.PayFees({
      asset: {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount / 4n),
      },
    }),

    // 3. Deposit reserve asset to Hydration
    XcmV5Instruction.DepositReserveAsset({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
      dest: parachainLocation(hydrationParaId),
      xcm: [
        // On Hydration: buy execution (must use BuyExecution, not PayFees for V4 compat)
        XcmV5Instruction.BuyExecution({
          fees: {
            id: DOT_ASSET_ID,
            fun: XcmV3MultiassetFungibility.Fungible(feeAmount / 4n),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // Deposit to Collectives sovereign account
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
          beneficiary: parachainLocation(collectivesParaId),
        }),
      ],
    }),
  ]);
}

/**
 * Build XCM to schedule DCA on Hydration
 * This is sent from Asset Hub scheduler to Hydration after warm-up period
 */
export function buildDcaScheduleXcm(
  network: NetworkType,
  dcaCallEncoded: Binary,
  feeAmount: bigint
): XcmVersionedXcm {
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  return XcmVersionedXcm.V5([
    // 1. Withdraw fee payment from sovereign account (using DOT on Hydration)
    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
    ]),

    // 2. Buy execution
    XcmV5Instruction.BuyExecution({
      fees: {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),

    // 3. Change origin to Collectives sovereign account
    XcmV5Instruction.AliasOrigin(parachainLocation(collectivesParaId)),

    // 4. Execute DCA.schedule call
    XcmV5Instruction.Transact({
      origin_kind: XcmV2OriginKind.SovereignAccount(),
      fallback_max_weight: {
        ref_time: 1000000000n,
        proof_size: 64000n,
      },
      call: dcaCallEncoded,
    }),
  ]);
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

  // Asset IDs from Hydration's perspective (reserve assets from Asset Hub)
  const usdtAssetId = getUsdtAssetIdFromHydration(network);
  const usdcAssetId = getUsdcAssetIdFromHydration(network);

  // Asset IDs on Asset Hub (local perspective)
  const usdtAssetIdLocal = getUsdtAssetId(network);
  const usdcAssetIdLocal = getUsdcAssetId(network);

  return XcmVersionedXcm.V5([
    // 1. Withdraw stables from Collectives sovereign account on Hydration
    XcmV5Instruction.WithdrawAsset([
      {
        id: usdtAssetId,
        fun: XcmV3MultiassetFungibility.Fungible(usdtAmount),
      },
      {
        id: usdcAssetId,
        fun: XcmV3MultiassetFungibility.Fungible(usdcAmount),
      },
    ]),

    // 2. Pay fees on Hydration (using USDT)
    XcmV5Instruction.BuyExecution({
      fees: {
        id: usdtAssetId,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),

    // 3. Change origin to Collectives sovereign account
    XcmV5Instruction.AliasOrigin(parachainLocation(collectivesParaId)),

    // 4. Initiate reserve withdraw back to Asset Hub with nested instructions
    XcmV5Instruction.InitiateReserveWithdraw({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(2)),
      reserve: parachainLocation(assetHubParaId),
      xcm: [
        // On Asset Hub: Clear origin
        XcmV5Instruction.ClearOrigin(),

        // Pay fees on Asset Hub (using USDT)
        XcmV5Instruction.BuyExecution({
          fees: {
            id: usdtAssetIdLocal,
            fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // Deposit 70% to Fellowship Treasury
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Definite([
            {
              id: usdtAssetIdLocal,
              fun: XcmV3MultiassetFungibility.Fungible(usdtTreasury),
            },
            {
              id: usdcAssetIdLocal,
              fun: XcmV3MultiassetFungibility.Fungible(usdcTreasury),
            },
          ]),
          beneficiary: accountOnAssetHub(fellowshipTreasuryId),
        }),

        // Deposit remaining 30% to Fellowship Salary
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(2)),
          beneficiary: accountOnAssetHub(fellowshipSalaryId),
        }),
      ],
    }),
  ]);
}
