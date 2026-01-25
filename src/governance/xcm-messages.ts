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
 * DOT (relay chain native) is always { parents: 1, interior: Here }
 * from any parachain's perspective
 */
export const DOT_ASSET_ID = {
  parents: 1,
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
 * This transfers DOT to both:
 * - Asset Hub's sovereign account on Hydration (fee stash for XCM operations)
 * - Collectives sovereign account on Hydration (main pool for DCA trading)
 */
export function buildTreasuryToHydrationXcm(
  network: NetworkType,
  dotAmount: bigint,
  feeAmount: bigint,
  feeStashAmount: bigint
): XcmVersionedXcm {
  const hydrationParaId = getParachainId(network, 'HYDRATION');
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');

  return XcmVersionedXcm.V5([
    // 1. Withdraw DOT from treasury including fee stash
    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(dotAmount + feeAmount + feeStashAmount),
      },
    ]),

    // 2. Pay fees on Asset Hub
    XcmV5Instruction.PayFees({
      asset: {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount / 4n),
      },
    }),

    // 3. Deposit reserve asset to Hydration with two beneficiaries
    XcmV5Instruction.DepositReserveAsset({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
      dest: parachainLocation(hydrationParaId),
      xcm: [
        // On Hydration: buy execution
        XcmV5Instruction.BuyExecution({
          fees: {
            id: DOT_ASSET_ID,
            fun: XcmV3MultiassetFungibility.Fungible(feeAmount / 4n),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // FIRST: Fee stash to Asset Hub's sovereign account
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Definite([
            {
              id: DOT_ASSET_ID,
              fun: XcmV3MultiassetFungibility.Fungible(feeStashAmount),
            },
          ]),
          beneficiary: parachainLocation(assetHubParaId),
        }),

        // SECOND: Remainder to Collectives sovereign account
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
 * Build XCM for periodic return with configurable treasury/salary split
 * This transfers stablecoins from Hydration back to Asset Hub
 * with split to Fellowship Treasury and Salary based on provided percentage
 *
 * Flow:
 * 1. Withdraw DOT from Asset Hub's sovereign account (fee stash) for XCM fees
 * 2. Pay fees in DOT
 * 3. Alias to Collectives sovereign account
 * 4. Withdraw stablecoins from Collectives sovereign
 * 5. InitiateReserveWithdraw to send stablecoins back to Asset Hub
 */
export function buildPeriodicReturnXcm(
  network: NetworkType,
  usdtAmount: bigint,
  usdcAmount: bigint,
  feeAmount: bigint, // DOT fee for XCM execution on Hydration
  treasurySplitPercent: number = 70
): XcmVersionedXcm {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  // Calculate split amounts based on user-provided percentage
  const usdtTreasury = (usdtAmount * BigInt(treasurySplitPercent)) / 100n;
  const usdcTreasury = (usdcAmount * BigInt(treasurySplitPercent)) / 100n;

  // Decode Fellowship addresses
  const fellowshipTreasuryId = decodeAddress(ACCOUNTS.FELLOWSHIP_TREASURY);
  const fellowshipSalaryId = decodeAddress(ACCOUNTS.FELLOWSHIP_SALARY);

  // Asset IDs from Hydration's perspective (reserve assets from Asset Hub)
  const usdtAssetId = getUsdtAssetIdFromHydration(network);
  const usdcAssetId = getUsdcAssetIdFromHydration(network);

  // Asset IDs on Asset Hub (local perspective)
  const usdtAssetIdLocal = getUsdtAssetId(network);
  const usdcAssetIdLocal = getUsdcAssetId(network);

  // Build withdraw assets array for stablecoins - only include non-zero amounts
  const withdrawStableAssets: Array<{
    id: typeof usdtAssetId;
    fun: ReturnType<typeof XcmV3MultiassetFungibility.Fungible>;
  }> = [];

  if (usdtAmount > 0n) {
    withdrawStableAssets.push({
      id: usdtAssetId,
      fun: XcmV3MultiassetFungibility.Fungible(usdtAmount),
    });
  }
  if (usdcAmount > 0n) {
    withdrawStableAssets.push({
      id: usdcAssetId,
      fun: XcmV3MultiassetFungibility.Fungible(usdcAmount),
    });
  }

  // Guard against edge case where both amounts are 0
  if (withdrawStableAssets.length === 0) {
    throw new Error('Cannot build periodic return XCM: both USDT and USDC amounts are 0');
  }

  const assetCount = withdrawStableAssets.length;

  // Build treasury deposit assets - only include non-zero amounts
  const treasuryDepositAssets: Array<{
    id: typeof usdtAssetIdLocal;
    fun: ReturnType<typeof XcmV3MultiassetFungibility.Fungible>;
  }> = [];

  if (usdtTreasury > 0n) {
    treasuryDepositAssets.push({
      id: usdtAssetIdLocal,
      fun: XcmV3MultiassetFungibility.Fungible(usdtTreasury),
    });
  }
  if (usdcTreasury > 0n) {
    treasuryDepositAssets.push({
      id: usdcAssetIdLocal,
      fun: XcmV3MultiassetFungibility.Fungible(usdcTreasury),
    });
  }

  // Determine fee asset for BuyExecution on Asset Hub - prefer USDT if available
  const feeAssetLocal = usdtAmount > 0n ? usdtAssetIdLocal : usdcAssetIdLocal;
  // Stablecoin fee amount for Asset Hub execution (use a reasonable estimate)
  const stablecoinFeeOnAssetHub = BigInt(100000); // 0.1 USDT/USDC (6 decimals)

  return XcmVersionedXcm.V5([
    // 1. Withdraw DOT for fees from Asset Hub's sovereign account (fee stash)
    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
    ]),

    // 2. Pay fees in DOT on Hydration
    XcmV5Instruction.BuyExecution({
      fees: {
        id: DOT_ASSET_ID,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),

    // 3. Alias origin to Collectives sovereign account
    XcmV5Instruction.AliasOrigin(parachainLocation(collectivesParaId)),

    // 4. Withdraw stablecoins from Collectives sovereign account
    XcmV5Instruction.WithdrawAsset(withdrawStableAssets),

    // 5. Initiate reserve withdraw back to Asset Hub with nested instructions
    XcmV5Instruction.InitiateReserveWithdraw({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(assetCount)),
      reserve: parachainLocation(assetHubParaId),
      xcm: [
        // Pay fees on Asset Hub using stablecoins
        XcmV5Instruction.BuyExecution({
          fees: {
            id: feeAssetLocal,
            fun: XcmV3MultiassetFungibility.Fungible(stablecoinFeeOnAssetHub),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // Deposit treasury percentage to Fellowship Treasury (only non-zero assets)
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Definite(treasuryDepositAssets),
          beneficiary: accountOnAssetHub(fellowshipTreasuryId),
        }),

        // Deposit remaining to Fellowship Salary using Wild
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(assetCount)),
          beneficiary: accountOnAssetHub(fellowshipSalaryId),
        }),
      ],
    }),
  ]);
}
