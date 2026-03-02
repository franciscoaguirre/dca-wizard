/**
 * XCM Message Builders
 * Constructs XCM messages for the single batched proposal on Collectives.
 *
 * Architecture: pallet_xcm::send() prepends DescendOrigin(Plurality(Treasury, Voice))
 * because SendXcmOrigin converts the Architects origin to Treasurer Plurality.
 *
 * Three operations batched in one proposal:
 * 1. Transfer DOT: → Asset Hub (V5, AliasOrigin to become Fellowship Treasury)
 * 2. Start DCA: → Hydration (V4, Plurality sovereign has DOT from step 1)
 * 3. Periodic Returns: → Hydration (V4, return stables to Asset Hub)
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
  XcmV4Instruction,
  XcmV4AssetAssetFilter,
  XcmV4AssetWildAsset,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV3Junctions,
  XcmV3Junction,
  XcmV3JunctionBodyId,
  XcmV2JunctionBodyPart,
  XcmV2OriginKind,
} from '@polkadot-api/descriptors';
import { Binary } from 'polkadot-api';
import type { NetworkType } from '../api/constants';
import {
  getParachainId,
  getAssetHubAssetId,
  ACCOUNTS,
  FELLOWSHIP_TREASURY_PALLET_INDEX,
} from '../api/constants';

// Re-export XcmVersionedXcm for use in other modules
export type { XcmVersionedXcm };

// ============================================================================
// V5 Helpers (for Asset Hub-bound XCMs)
// ============================================================================

export function parachainLocationV5(parachainId: number) {
  return {
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(parachainId)),
  };
}

export function accountOnAssetHubV5(accountIdBytes: Uint8Array) {
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

export const DOT_ASSET_ID_V5 = {
  parents: 1,
  interior: XcmV5Junctions.Here(),
};

// ============================================================================
// V4/V3 Helpers (for Hydration-bound XCMs)
// ============================================================================

export function parachainLocationV3(parachainId: number) {
  return {
    parents: 1,
    interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(parachainId)),
  };
}

export function accountLocationV3(accountIdBytes: Uint8Array) {
  return {
    parents: 0,
    interior: XcmV3Junctions.X1(
      XcmV3Junction.AccountId32({
        network: undefined,
        id: Binary.fromBytes(accountIdBytes),
      })
    ),
  };
}

export const DOT_ASSET_ID_V3 = {
  parents: 1,
  interior: XcmV3Junctions.Here(),
};

// ============================================================================
// Asset ID Helpers
// ============================================================================

export function getUsdtAssetId(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDT');
  return {
    parents: 0,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.PalletInstance(50),
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

export function getUsdcAssetId(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDC');
  return {
    parents: 0,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.PalletInstance(50),
      XcmV5Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

export function getUsdtAssetIdFromHydration(network: NetworkType) {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const assetId = getAssetHubAssetId(network, 'USDT');
  return {
    parents: 1,
    interior: XcmV3Junctions.X3([
      XcmV3Junction.Parachain(assetHubParaId),
      XcmV3Junction.PalletInstance(50),
      XcmV3Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

export function getUsdcAssetIdFromHydration(network: NetworkType) {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const assetId = getAssetHubAssetId(network, 'USDC');
  return {
    parents: 1,
    interior: XcmV3Junctions.X3([
      XcmV3Junction.Parachain(assetHubParaId),
      XcmV3Junction.PalletInstance(50),
      XcmV3Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

function getUsdtAssetIdV3(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDT');
  return {
    parents: 0,
    interior: XcmV3Junctions.X2([
      XcmV3Junction.PalletInstance(50),
      XcmV3Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

function getUsdcAssetIdV3(network: NetworkType) {
  const assetId = getAssetHubAssetId(network, 'USDC');
  return {
    parents: 0,
    interior: XcmV3Junctions.X2([
      XcmV3Junction.PalletInstance(50),
      XcmV3Junction.GeneralIndex(BigInt(assetId)),
    ] as const),
  };
}

// ============================================================================
// SS58 Decoding
// ============================================================================

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

// ============================================================================
// Step 1: Transfer DOT from Fellowship Treasury to Hydration
// ============================================================================

/**
 * Build XCM to transfer DOT from Fellowship Treasury (on Asset Hub) to Hydration.
 *
 * Sent to Asset Hub via PolkadotXcm.send() from Collectives with Architects origin.
 * The pallet prepends DescendOrigin(Plurality(Treasury, Voice)), so the origin on
 * Asset Hub is (1, [Parachain(1001), Plurality(Treasury, Voice)]).
 *
 * We use AliasOrigin to become the Fellowship Treasury pallet account, which is
 * allowed by Asset Hub's FellowshipTreasurerAlias configuration.
 *
 * UnpaidExecution is used because the Treasurer Plurality is in FellowshipEntities,
 * which is included in AllowExplicitUnpaidExecutionFrom.
 *
 * DOT is deposited to the Plurality sovereign on Hydration (not plain parachain sovereign).
 */
export function buildTreasuryToHydrationXcm(
  network: NetworkType,
  dotAmount: bigint,
  feeAmountHydration: bigint
): XcmVersionedXcm {
  const hydrationParaId = getParachainId(network, 'HYDRATION');
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');

  return XcmVersionedXcm.V5([
    // 1. AliasOrigin to become Fellowship Treasury on Asset Hub
    // The pallet already prepended DescendOrigin(Plurality(Treasury, Voice))
    // AliasOrigin converts that to the Fellowship Treasury pallet account
    XcmV5Instruction.AliasOrigin({
      parents: 1,
      interior: XcmV5Junctions.X2([
        XcmV5Junction.Parachain(collectivesParaId),
        XcmV5Junction.PalletInstance(FELLOWSHIP_TREASURY_PALLET_INDEX),
      ] as const),
    }),

    // 2. UnpaidExecution — fees waived for Fellowship Treasury entities
    XcmV5Instruction.UnpaidExecution({
      weight_limit: XcmV3WeightLimit.Unlimited(),
      check_origin: undefined,
    }),

    // 3. Withdraw DOT from Fellowship Treasury sovereign on Asset Hub
    // Include extra DOT for Hydration-side fees
    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID_V5,
        fun: XcmV3MultiassetFungibility.Fungible(dotAmount + feeAmountHydration),
      },
    ]),

    // 4. Send DOT to Hydration, deposited to Plurality sovereign account
    XcmV5Instruction.DepositReserveAsset({
      assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
      dest: parachainLocationV5(hydrationParaId),
      xcm: [
        XcmV5Instruction.BuyExecution({
          fees: {
            id: DOT_ASSET_ID_V5,
            fun: XcmV3MultiassetFungibility.Fungible(feeAmountHydration),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // Deposit to Plurality sovereign: (1, [Parachain(1001), Plurality(Treasury, Voice)])
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
          beneficiary: {
            parents: 1,
            interior: XcmV5Junctions.X2([
              XcmV5Junction.Parachain(collectivesParaId),
              XcmV5Junction.Plurality({
                id: XcmV3JunctionBodyId.Treasury(),
                part: XcmV2JunctionBodyPart.Voice(),
              }),
            ] as const),
          },
        }),
      ],
    }),
  ]);
}

// ============================================================================
// Step 2: Start DCA on Hydration (scheduled after warmup)
// ============================================================================

/**
 * Build XCM to start DCA on Hydration.
 *
 * Sent to Hydration via PolkadotXcm.send() from Collectives.
 * The pallet prepends DescendOrigin(Plurality(Treasury, Voice)), so the origin
 * IS the Plurality sovereign — it can access DOT deposited in step 1.
 *
 * Uses V4 since Hydration doesn't support V5 yet.
 */
export function buildDcaScheduleXcm(
  dcaCallEncoded: Binary,
  feeAmount: bigint
): XcmVersionedXcm {
  return XcmVersionedXcm.V4([
    // 1. Withdraw DOT for fees from Plurality sovereign on Hydration
    XcmV4Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID_V3,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
    ]),

    // 2. Buy execution
    XcmV4Instruction.BuyExecution({
      fees: {
        id: DOT_ASSET_ID_V3,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),

    // 3. Transact to call DCA.schedule as Plurality sovereign
    XcmV4Instruction.Transact({
      origin_kind: XcmV2OriginKind.SovereignAccount(),
      require_weight_at_most: {
        ref_time: 1_000_000_000n,
        proof_size: 100_000n,
      },
      call: dcaCallEncoded,
    }),
  ]);
}

// ============================================================================
// Step 3: Periodic Return of stablecoins (scheduled with maybe_periodic)
// ============================================================================

/**
 * Build XCM to return stablecoins from Hydration to Fellowship Treasury/Salary on Asset Hub.
 *
 * Amounts are per-return (not total). Called periodically by the Collectives scheduler.
 *
 * Sent to Hydration via PolkadotXcm.send() from Collectives.
 * The pallet prepends DescendOrigin(Plurality(Treasury, Voice)), giving access
 * to the Plurality sovereign's stablecoin balances.
 *
 * Uses V4 since Hydration doesn't support V5 yet.
 */
export function buildPeriodicReturnXcm(
  network: NetworkType,
  usdtAmountPerReturn: bigint,
  usdcAmountPerReturn: bigint,
  feeAmount: bigint,
  treasurySplitPercent: number
): XcmVersionedXcm {
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');

  // Calculate split amounts (per-return)
  const usdtTreasury = (usdtAmountPerReturn * BigInt(treasurySplitPercent)) / 100n;
  const usdcTreasury = (usdcAmountPerReturn * BigInt(treasurySplitPercent)) / 100n;

  // Decode Fellowship addresses
  const fellowshipTreasuryId = decodeAddress(ACCOUNTS.FELLOWSHIP_TREASURY);
  const fellowshipSalaryId = decodeAddress(ACCOUNTS.FELLOWSHIP_SALARY);

  // Asset IDs from Hydration's perspective (reserve assets from Asset Hub)
  const usdtAssetId = getUsdtAssetIdFromHydration(network);
  const usdcAssetId = getUsdcAssetIdFromHydration(network);

  // Asset IDs on Asset Hub (local perspective, V3 for V4 inner XCMs)
  const usdtAssetIdLocal = getUsdtAssetIdV3(network);
  const usdcAssetIdLocal = getUsdcAssetIdV3(network);

  // Build withdraw assets array - only include non-zero amounts
  const withdrawStableAssets: Array<{
    id: typeof usdtAssetId;
    fun: ReturnType<typeof XcmV3MultiassetFungibility.Fungible>;
  }> = [];

  if (usdtAmountPerReturn > 0n) {
    withdrawStableAssets.push({
      id: usdtAssetId,
      fun: XcmV3MultiassetFungibility.Fungible(usdtAmountPerReturn),
    });
  }
  if (usdcAmountPerReturn > 0n) {
    withdrawStableAssets.push({
      id: usdcAssetId,
      fun: XcmV3MultiassetFungibility.Fungible(usdcAmountPerReturn),
    });
  }

  if (withdrawStableAssets.length === 0) {
    throw new Error('Cannot build return XCM: both USDT and USDC amounts are 0');
  }

  const assetCount = withdrawStableAssets.length;

  // Build treasury deposit assets
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

  return XcmVersionedXcm.V4([
    // 1. Withdraw stablecoins + DOT for fees from Plurality sovereign on Hydration
    XcmV4Instruction.WithdrawAsset([
      ...withdrawStableAssets,
      {
        id: DOT_ASSET_ID_V3,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
    ]),

    // 2. Buy execution with DOT
    XcmV4Instruction.BuyExecution({
      fees: {
        id: DOT_ASSET_ID_V3,
        fun: XcmV3MultiassetFungibility.Fungible(feeAmount),
      },
      weight_limit: XcmV3WeightLimit.Unlimited(),
    }),

    // 3. Send stablecoins back to Asset Hub with split between Treasury and Salary
    XcmV4Instruction.InitiateReserveWithdraw({
      // +1 to include leftover DOT from BuyExecution
      assets: XcmV4AssetAssetFilter.Wild(XcmV4AssetWildAsset.AllCounted(assetCount + 1)),
      reserve: parachainLocationV3(assetHubParaId),
      xcm: [
        // Buy execution on Asset Hub
        XcmV4Instruction.BuyExecution({
          fees: {
            id: DOT_ASSET_ID_V3,
            fun: XcmV3MultiassetFungibility.Fungible(100_000n),
          },
          weight_limit: XcmV3WeightLimit.Unlimited(),
        }),

        // Deposit treasury percentage to Fellowship Treasury
        XcmV4Instruction.DepositAsset({
          assets: XcmV4AssetAssetFilter.Definite(treasuryDepositAssets),
          beneficiary: accountLocationV3(fellowshipTreasuryId),
        }),

        // Deposit remainder to Fellowship Salary
        XcmV4Instruction.DepositAsset({
          assets: XcmV4AssetAssetFilter.Wild(XcmV4AssetWildAsset.AllCounted(assetCount)),
          beneficiary: accountLocationV3(fellowshipSalaryId),
        }),
      ],
    }),
  ]);
}
