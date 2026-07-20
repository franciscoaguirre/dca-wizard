/**
 * Governance execution utilities for Chopsticks testing
 * Handles preimage storage and scheduler-based call execution
 */

import { Binary, type FixedSizeBinary } from "polkadot-api";
import { getPolkadotSigner } from "@polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  entropyToMiniSecret,
  mnemonicToEntropy,
  DEV_PHRASE,
} from "@polkadot-labs/hdkd-helpers";
import { blake2b } from "@noble/hashes/blake2.js";
import type { ChopsticksClients } from "./setup";
import { advanceCollectivesBlocks } from "./setup";

/**
 * Create a signer for Alice (dev account)
 */
export function createAliceSigner() {
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive("//Alice");

  return getPolkadotSigner(keyPair.publicKey, "Sr25519", keyPair.sign);
}

/**
 * Compute blake2b hash of call data
 */
export function computeCallHash(callData: Binary): {
  hash: Uint8Array;
  hashHex: string;
} {
  const hash = blake2b(callData.asBytes(), { dkLen: 32 });
  const hashHex = Binary.fromBytes(hash).asHex();
  return { hash, hashHex };
}

/**
 * Store a preimage on Asset Hub
 */
export async function storePreimage(
  clients: ChopsticksClients,
  callData: Binary
) {
  console.log("Storing preimage on Asset Hub...");

  const signer = createAliceSigner();

  const preimageCall = clients.ahApi.tx.Preimage.note_preimage({
    bytes: callData,
  });

  // Submit the transaction
  const tx = await preimageCall.signAndSubmit(signer);

  let preimageHash: string | null = null;

  // Find the Preimage.Noted event
  tx.events.find((event) => {
    if (event.type === "Preimage" && event.value.type === "Noted") {
      preimageHash = event.value.value.hash.asHex();
    }
  });

  if (!preimageHash) {
    throw new Error("Failed to get preimage hash from events");
  }

  console.log(`Preimage stored with hash: ${preimageHash}`);

  return {
    preimageHash,
    preimageCall,
  };
}

/**
 * Get a preimage from Asset Hub
 */
export async function getPreimage(
  clients: ChopsticksClients,
  hash: FixedSizeBinary<32>,
  length: number
): Promise<Binary | undefined> {
  return await clients.ahApi.query.Preimage.PreimageFor.getValue([
    hash,
    length,
  ]);
}

/**
 * Execute a governance call via scheduler storage manipulation
 * This injects the call directly into the scheduler with Root origin
 */
/**
 * Inject one scheduled call into the Asset Hub scheduler agenda with a Root
 * origin, and set `IncompleteSince` so the scheduler still services it after
 * `now` has moved past the target block.
 *
 * Post-AHM the Asset Hub scheduler keys its agenda on the *relay* chain block
 * number (its BlockNumberProvider), so we schedule at `LastRelayChainBlockNumber`
 * and mark `IncompleteSince` to the same block. `service_agendas` then processes
 * the range `[IncompleteSince, now]`, which includes our entry. Without
 * `IncompleteSince`, only `agenda[now]` is serviced and an entry injected at the
 * current block is silently skipped on the next block — the reason nothing
 * dispatched before.
 *
 * The stored agenda is read back and logged so a missing/misplaced entry is
 * visible immediately.
 */
async function injectAhSchedulerCall(
  clients: ChopsticksClients,
  scheduledCall: unknown
): Promise<{ executeAtBlock: number }> {
  const relayNow = Number(
    await clients.ahApi.query.ParachainSystem.LastRelayChainBlockNumber.getValue()
  );
  const localNow = Number(await clients.ahApi.query.System.Number.getValue());
  const executeAtBlock = relayNow;

  console.log(
    `  Block numbers on Asset Hub — local System.Number=${localNow}, relay LastRelayChainBlockNumber=${relayNow}`
  );
  console.log(
    `  Injecting agenda at relay block ${executeAtBlock} with IncompleteSince=${executeAtBlock} (Root origin)`
  );

  await clients.ahClient._request("dev_setStorage", [
    {
      scheduler: {
        agenda: [
          [
            [executeAtBlock],
            [
              {
                call: scheduledCall,
                origin: { system: "Root" },
              },
            ],
          ],
        ],
        incompleteSince: executeAtBlock,
      },
    },
  ]);

  // Read the agenda back so a missing entry (wrong storage shape or block key)
  // is obvious rather than silently producing no Dispatched event.
  const agenda = await clients.ahApi.query.Scheduler.Agenda.getValue(executeAtBlock);
  console.log(`  Agenda at relay block ${executeAtBlock}: ${agenda.length} entry(ies) stored`);
  for (const entry of agenda) {
    if (entry) {
      console.log(
        `    stored entry: call.type=${entry.call?.type}, origin=${JSON.stringify(
          entry.origin,
          (_, v) => (typeof v === "bigint" ? v.toString() : v)
        )}`
      );
    }
  }
  if (agenda.length === 0) {
    console.log(
      "  WARNING: no agenda entry was stored. The dev_setStorage shape may not match this runtime's Scheduler.Agenda, or the block key is wrong."
    );
  }

  return { executeAtBlock };
}

export async function executeGovernanceCall(
  clients: ChopsticksClients,
  preimageHash: string,
  callSize: number
) {
  console.log("Injecting governance call into Asset Hub scheduler (Root, Lookup)...");
  return injectAhSchedulerCall(clients, {
    Lookup: { hash: preimageHash, len: callSize },
  });
}

/**
 * Execute a raw call directly via scheduler (without preimage)
 * Use this for smaller calls that don't need preimage storage
 */
export async function executeCallDirectly(
  clients: ChopsticksClients,
  encodedCall: Binary
) {
  console.log("Injecting call into Asset Hub scheduler (Root, Inline)...");
  return injectAhSchedulerCall(clients, {
    Inline: encodedCall.asHex(),
  });
}

/**
 * Process a hex-encoded call for execution
 * Automatically handles preimage storage for large calls
 */
export async function processCallForExecution(
  clients: ChopsticksClients,
  callHex: string
): Promise<{ hash: string; size: number }> {
  const callData = Binary.fromHex(callHex);
  const callSize = callData.asBytes().length;
  const { hashHex } = computeCallHash(callData);

  console.log(`Call size: ${callSize} bytes`);
  console.log(`Call hash: ${hashHex}`);

  await storePreimage(clients, callData);

  return {
    hash: hashHex,
    size: callSize,
  };
}

/**
 * Execute a batch call on Collectives chain with Architects (FellowshipOrigins) origin.
 * Injects the call into the Collectives scheduler via dev_setStorage.
 */
export async function executeCollectivesBatchCall(
  clients: ChopsticksClients,
  encodedCallHex: string
) {
  console.log("Injecting batch call into Collectives scheduler with Architects origin...");

  const callData = Binary.fromHex(encodedCallHex);
  const callSize = callData.asBytes().length;
  const { hashHex } = computeCallHash(callData);

  console.log(`Batch call size: ${callSize} bytes`);
  console.log(`Batch call hash: ${hashHex}`);

  // Step 1: Store preimage via note_preimage transaction FIRST.
  // We submit the transaction, then advance a block to include it.
  // This ensures the runtime itself handles the PreimageFor encoding correctly.
  const signer = createAliceSigner();
  console.log("Submitting note_preimage transaction...");
  const txPromise = clients.collectivesApi.tx.Preimage.note_preimage({
    bytes: callData,
  }).signAndSubmit(signer);

  // Give PAPI time to submit the RPC call, then produce a block to include it
  await new Promise(resolve => setTimeout(resolve, 500));
  await advanceCollectivesBlocks(clients, 1);

  const txResult = await txPromise;
  console.log(`note_preimage tx finalized: ${txResult.ok ? "success" : "FAILED"}`);
  if (!txResult.ok) {
    console.log(`Dispatch error: ${JSON.stringify(txResult.dispatchError, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
  }

  // Check the Preimage.Noted event to see the actual hash the runtime computed
  for (const event of txResult.events) {
    console.log(`  Event: ${event.type}.${event.value.type}`);
    if (event.type === "Preimage" && event.value.type === "Noted") {
      const runtimeHash = event.value.value.hash;
      console.log(`  Runtime preimage hash: ${typeof runtimeHash === 'object' && runtimeHash.asHex ? runtimeHash.asHex() : runtimeHash}`);
      console.log(`  Our computed hash:     ${hashHex}`);
      console.log(`  Hashes match: ${(typeof runtimeHash === 'object' && runtimeHash.asHex ? runtimeHash.asHex() : String(runtimeHash)) === hashHex}`);
    }
  }

  // Step 2: Now inject the scheduler entry via dev_setStorage.
  // The preimage is already stored from step 1.
  const currentBlock = await clients.collectivesApi.query.System.Number.getValue();
  const executeAtBlock = Number(currentBlock) + 1;

  console.log(`Scheduling execution at Collectives block ${executeAtBlock}`);

  await clients.collectivesClient._request("dev_setStorage", [
    {
      scheduler: {
        agenda: [
          [
            [executeAtBlock],
            [
              {
                call: {
                  Lookup: {
                    hash: hashHex,
                    len: callSize,
                  },
                },
                origin: {
                  FellowshipOrigins: "Architects",
                },
              },
            ],
          ],
        ],
        incompleteSince: executeAtBlock,
      },
    },
  ]);

  console.log("Scheduler entry injected via dev_setStorage");

  // Verify scheduler agenda and inspect the stored entry
  const agenda = await clients.collectivesApi.query.Scheduler.Agenda.getValue(executeAtBlock);
  console.log(`Agenda at block ${executeAtBlock}: ${agenda.length} entries`);
  for (const entry of agenda) {
    if (entry) {
      console.log(`  Agenda entry call type: ${entry.call.type}`);
      if (entry.call.type === "Lookup") {
        const lookupHash = entry.call.value.hash.asHex();
        const lookupLen = entry.call.value.len;
        console.log(`  Lookup hash: ${lookupHash}`);
        console.log(`  Lookup len:  ${lookupLen}`);
        console.log(`  Hash matches our computed hash: ${lookupHash === hashHex}`);
        console.log(`  Len matches callSize: ${lookupLen === callSize}`);
      }
      console.log(`  Origin: ${JSON.stringify(entry.origin, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    }
  }

  console.log(`Batch call scheduled for Collectives block ${executeAtBlock} with Architects origin`);

  return {
    executeAtBlock,
    hash: hashHex,
    size: callSize,
  };
}
