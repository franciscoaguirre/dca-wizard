/**
 * XCM Message Builders (V5)
 *
 * Two XCMs are produced — both sent from Collectives via PolkadotXcm.send to AH:
 *
 *   1. buildSetupXcm    — DOT deposit + DCA.schedule Transact in a single inbound XCM
 *      on Hydration, via V5 InitiateTransfer { preserve_origin: true }.
 *
 *   2. buildPeriodicReturnXcm — Collectives → AH → Hydration → AH return:
 *      AH withdraws a small DOT fee from FellowshipTreasury, hops to Hydration with
 *      preserve_origin to land as the FT-pallet sovereign, withdraws HOLLAR + DOT
 *      from that sovereign, then InitiateTransfer back to AH with HOLLAR as
 *      ReserveDeposit (Hydration is HOLLAR's reserve) and DOT as ReserveWithdraw.
 *
 * Custody invariant: the DCA owner / DOT+HOLLAR custody account on Hydration is the
 * SS58 derivation of (1,[Parachain(collectives),PalletInstance(65)]) via Hydration's
 * LocationToAccountId. Hydration accepts the AliasOrigin to this target via
 * `AliasOriginRootUsingFilter<AssetHubLocation, RestrictedAssetHubAliases>` (post
 * d026a6748: descendants of any system parachain with id<2000).
 */

import {
  XcmVersionedXcm,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5AssetFilter,
  XcmV5WildAsset,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV2MultiassetWildFungibility,
  XcmV2OriginKind,
} from '@polkadot-api/descriptors';
import { Binary, Enum, getSs58AddressInfo } from 'polkadot-api';
import type { NetworkType } from '../api/constants';
import {
  getParachainId,
  getHydrationAssetId,
  ACCOUNTS,
  FELLOWSHIP_TREASURY_PALLET_INDEX,
} from '../api/constants';

function ss58ToPublicKey(address: string): Uint8Array {
  const info = getSs58AddressInfo(address);
  if (!info.isValid) {
    throw new Error(`Failed to decode SS58 address: ${address}`);
  }
  return info.publicKey;
}

const FELLOWSHIP_TREASURY_ID = ss58ToPublicKey(ACCOUNTS.FELLOWSHIP_TREASURY);
const FELLOWSHIP_SALARY_ID = ss58ToPublicKey(ACCOUNTS.FELLOWSHIP_SALARY);

export type { XcmVersionedXcm };

// ---------------------------------------------------------------------------
// Location helpers (V5)
// ---------------------------------------------------------------------------

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
      }),
    ),
  };
}

/**
 * Fellowship Treasury pallet sovereign location. Same shape from any consensus
 * sibling's POV (parents=1 → relay; Parachain(collectives) → into Collectives;
 * PalletInstance(65) → the Fellowship Treasury pallet).
 */
export function fellowshipTreasuryPalletLocationV5(network: NetworkType) {
  const collectivesParaId = getParachainId(network, 'COLLECTIVES');
  return {
    parents: 1,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.Parachain(collectivesParaId),
      XcmV5Junction.PalletInstance(FELLOWSHIP_TREASURY_PALLET_INDEX),
    ] as const),
  };
}

// DOT, from any sibling's POV, is the relay-chain native asset: (1, Here).
export const DOT_ASSET_ID_V5 = {
  parents: 1,
  interior: XcmV5Junctions.Here(),
};

/**
 * HOLLAR's canonical multilocation: (1, X2(Parachain(2034), GeneralIndex(222))).
 * Same shape as a reserve asset on Hydration AND as the foreign-asset id on AH.
 */
export function hollarAssetIdV5(network: NetworkType) {
  const hydrationParaId = getParachainId(network, 'HYDRATION');
  const hollarId = getHydrationAssetId(network, 'HOLLAR');
  return {
    parents: 1,
    interior: XcmV5Junctions.X2([
      XcmV5Junction.Parachain(hydrationParaId),
      XcmV5Junction.GeneralIndex(BigInt(hollarId)),
    ] as const),
  };
}

// ---------------------------------------------------------------------------
// Setup XCM — single combined transfer + DCA.schedule Transact
// ---------------------------------------------------------------------------

/**
 * Build the AH-side outer XCM for setup mode.
 *
 * On AH (sent by Collectives.PolkadotXcm.send with Architects origin; the pallet
 * prepends DescendOrigin([Plurality(Tech,Voice),GeneralIndex(4)])):
 *   - AliasOrigin → Fellowship Treasury pallet (allowed by AH's
 *     FellowshipArchitectsAliases for rank ≥ 4)
 *   - UnpaidExecution (Fellowship entities are in AH's unpaid-execution allow-list)
 *   - WithdrawAsset(DOT total + Hydration fee) from FT pallet account on AH
 *   - InitiateTransfer { preserve_origin: true }:
 *       remote_fees: ReserveDeposit(DOT fee) → PayFees on Hydration
 *       assets:    [ReserveDeposit(DOT total)]
 *       remote_xcm: [DepositAsset → FT sovereign on Hydration, Transact(DCA.schedule)]
 *
 * The auto-generated XCM that arrives on Hydration:
 *   [ReserveAssetDeposited(fee), PayFees(fee),
 *    ReserveAssetDeposited(rest),
 *    AliasOrigin((1,[Parachain(1001),PalletInstance(65)])),
 *    DepositAsset(rest → FT sovereign), Transact(DCA.schedule)]
 */
export function buildSetupXcm(
  network: NetworkType,
  dotTotalPlanck: bigint,
  hydrationFeePlanck: bigint,
  dcaCallEncoded: Binary,
): XcmVersionedXcm {
  if (hydrationFeePlanck <= 0n) {
    throw new Error('hydrationFeePlanck must be > 0 (PayFees needs a non-zero asset)');
  }

  const ftLocation = fellowshipTreasuryPalletLocationV5(network);
  const hydrationParaId = getParachainId(network, 'HYDRATION');

  return XcmVersionedXcm.V5([
    XcmV5Instruction.AliasOrigin(ftLocation),

    XcmV5Instruction.UnpaidExecution({
      weight_limit: XcmV3WeightLimit.Unlimited(),
      check_origin: undefined,
    }),

    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID_V5,
        fun: XcmV3MultiassetFungibility.Fungible(dotTotalPlanck + hydrationFeePlanck),
      },
    ]),

    XcmV5Instruction.InitiateTransfer({
      destination: parachainLocationV5(hydrationParaId),
      remote_fees: Enum(
        'ReserveDeposit',
        XcmV5AssetFilter.Definite([
          {
            id: DOT_ASSET_ID_V5,
            fun: XcmV3MultiassetFungibility.Fungible(hydrationFeePlanck),
          },
        ]),
      ),
      preserve_origin: true,
      assets: [
        Enum(
          'ReserveDeposit',
          XcmV5AssetFilter.Definite([
            {
              id: DOT_ASSET_ID_V5,
              fun: XcmV3MultiassetFungibility.Fungible(dotTotalPlanck),
            },
          ]),
        ),
      ],
      remote_xcm: [
        XcmV5Instruction.DepositAsset({
          assets: XcmV5AssetFilter.Wild(XcmV5WildAsset.AllCounted(1)),
          beneficiary: ftLocation,
        }),
        XcmV5Instruction.Transact({
          origin_kind: XcmV2OriginKind.SovereignAccount(),
          call: dcaCallEncoded,
          fallback_max_weight: undefined,
        }),
      ],
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Periodic-return XCM — Collectives → AH → Hydration → AH
// ---------------------------------------------------------------------------

/**
 * Build the AH-side outer XCM for one periodic-return cycle.
 *
 * Each cycle:
 *   - AH alias to FT pallet, withdraw a small DOT amount for Hydration fees
 *   - InitiateTransfer { preserve_origin: true } to Hydration with that DOT as
 *     remote_fees (paid as PayFees on Hydration)
 *   - On Hydration (auto-aliased to FT sovereign): withdraw HOLLAR + DOT-for-AH-fees
 *     from the FT sovereign, then InitiateTransfer back to AH:
 *       remote_fees: ReserveWithdraw(DOT) (DOT's reserve is AH/relay)
 *       assets:    [ReserveDeposit(HOLLAR)] (Hydration is HOLLAR's reserve)
 *       remote_xcm: split deposits to FellowshipTreasury and FellowshipSalary on AH
 *
 * Per-return amount split: treasurySplitPercent% of HOLLAR to Treasury, remainder
 * to Salary. The remainder DepositAsset is constrained to HOLLAR only (Wild
 * AllOf): any leftover DOT after AH-fee execution traps. We avoid bundling DOT
 * with the HOLLAR-to-Salary deposit because Salary is kept alive by USDT (a
 * sufficient asset) with `providers=0` — `pallet-balances` rejects a DOT
 * credit to such an account, which would also fail the HOLLAR transfer in the
 * same instruction.
 */
export function buildPeriodicReturnXcm(
  network: NetworkType,
  hollarAmountPerReturn: bigint,
  hydrationFee: bigint,
  ahReturnFee: bigint,
  treasurySplitPercent: number,
): XcmVersionedXcm {
  if (hollarAmountPerReturn <= 0n) {
    throw new Error('Cannot build return XCM: HOLLAR amount must be > 0');
  }
  if (hydrationFee <= 0n || ahReturnFee <= 0n) {
    throw new Error('Both hydrationFee and ahReturnFee must be > 0');
  }

  const ftLocation = fellowshipTreasuryPalletLocationV5(network);
  const assetHubParaId = getParachainId(network, 'ASSET_HUB');
  const hydrationParaId = getParachainId(network, 'HYDRATION');
  const hollarAssetId = hollarAssetIdV5(network);

  const hollarTreasury = (hollarAmountPerReturn * BigInt(treasurySplitPercent)) / 100n;

  return XcmVersionedXcm.V5([
    XcmV5Instruction.AliasOrigin(ftLocation),

    XcmV5Instruction.UnpaidExecution({
      weight_limit: XcmV3WeightLimit.Unlimited(),
      check_origin: undefined,
    }),

    XcmV5Instruction.WithdrawAsset([
      {
        id: DOT_ASSET_ID_V5,
        fun: XcmV3MultiassetFungibility.Fungible(hydrationFee),
      },
    ]),

    XcmV5Instruction.InitiateTransfer({
      destination: parachainLocationV5(hydrationParaId),
      remote_fees: Enum(
        'ReserveDeposit',
        XcmV5AssetFilter.Definite([
          {
            id: DOT_ASSET_ID_V5,
            fun: XcmV3MultiassetFungibility.Fungible(hydrationFee),
          },
        ]),
      ),
      preserve_origin: true,
      assets: [],
      remote_xcm: [
        // Origin here is FT sovereign on Hydration (auto-AliasOrigin).
        // Asset list sorted by location: DOT (Here) before HOLLAR (X2(...)).
        XcmV5Instruction.WithdrawAsset([
          {
            id: DOT_ASSET_ID_V5,
            fun: XcmV3MultiassetFungibility.Fungible(ahReturnFee),
          },
          {
            id: hollarAssetId,
            fun: XcmV3MultiassetFungibility.Fungible(hollarAmountPerReturn),
          },
        ]),
        XcmV5Instruction.InitiateTransfer({
          destination: parachainLocationV5(assetHubParaId),
          remote_fees: Enum(
            'ReserveWithdraw',
            XcmV5AssetFilter.Definite([
              {
                id: DOT_ASSET_ID_V5,
                fun: XcmV3MultiassetFungibility.Fungible(ahReturnFee),
              },
            ]),
          ),
          preserve_origin: false,
          assets: [
            Enum(
              'ReserveDeposit',
              XcmV5AssetFilter.Definite([
                {
                  id: hollarAssetId,
                  fun: XcmV3MultiassetFungibility.Fungible(hollarAmountPerReturn),
                },
              ]),
            ),
          ],
          remote_xcm: [
            XcmV5Instruction.DepositAsset({
              assets: XcmV5AssetFilter.Definite([
                {
                  id: hollarAssetId,
                  fun: XcmV3MultiassetFungibility.Fungible(hollarTreasury),
                },
              ]),
              beneficiary: accountOnAssetHubV5(FELLOWSHIP_TREASURY_ID),
            }),
            // HOLLAR remainder only — DOT dust traps (see header comment).
            XcmV5Instruction.DepositAsset({
              assets: XcmV5AssetFilter.Wild(
                XcmV5WildAsset.AllOf({
                  id: hollarAssetId,
                  fun: XcmV2MultiassetWildFungibility.Fungible(),
                }),
              ),
              beneficiary: accountOnAssetHubV5(FELLOWSHIP_SALARY_ID),
            }),
          ],
        }),
      ],
    }),
  ]);
}
