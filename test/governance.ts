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
export async function executeGovernanceCall(
  clients: ChopsticksClients,
  preimageHash: string,
  callSize: number
) {
  console.log("Executing governance call via scheduler storage manipulation...");

  // Get current relay chain block number to schedule execution
  const executeAtBlock =
    await clients.ahApi.query.ParachainSystem.LastRelayChainBlockNumber.getValue();

  console.log(`Scheduling governance execution at relay block ${executeAtBlock}`);

  // Use dev_setStorage to add this to the scheduler agenda
  await clients.ahClient._request("dev_setStorage", [
    {
      scheduler: {
        agenda: [
          [
            [executeAtBlock],
            [
              {
                call: {
                  Lookup: {
                    hash: preimageHash,
                    len: callSize,
                  },
                },
                origin: {
                  system: "Root",
                },
              },
            ],
          ],
        ],
      },
    },
  ]);

  console.log(`Governance call scheduled for execution at block ${executeAtBlock}`);

  return {
    executeAtBlock,
  };
}

/**
 * Execute a raw call directly via scheduler (without preimage)
 * Use this for smaller calls that don't need preimage storage
 */
export async function executeCallDirectly(
  clients: ChopsticksClients,
  encodedCall: Binary
) {
  console.log("Executing call directly via scheduler storage manipulation...");

  const executeAtBlock =
    await clients.ahApi.query.ParachainSystem.LastRelayChainBlockNumber.getValue();

  console.log(`Scheduling direct execution at relay block ${executeAtBlock}`);

  await clients.ahClient._request("dev_setStorage", [
    {
      scheduler: {
        agenda: [
          [
            [executeAtBlock],
            [
              {
                call: {
                  Inline: encodedCall.asHex(),
                },
                origin: {
                  system: "Root",
                },
              },
            ],
          ],
        ],
      },
    },
  ]);

  console.log(`Call scheduled for direct execution at block ${executeAtBlock}`);

  return {
    executeAtBlock,
  };
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

  // For calls > 10KB, use preimage storage
  const PREIMAGE_THRESHOLD = 10 * 1024;

  if (callSize > PREIMAGE_THRESHOLD) {
    console.log("Call exceeds 10KB, storing as preimage...");
    await storePreimage(clients, callData);
  } else {
    console.log("Call under 10KB, will use inline execution...");
    // Still store as preimage for consistency
    await storePreimage(clients, callData);
  }

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

  // 1. Set scheduler entry FIRST via dev_setStorage (schedules at block N+2 to leave room)
  const currentBlock = await clients.collectivesApi.query.System.Number.getValue();
  const executeAtBlock = Number(currentBlock) + 2;

  console.log(`Scheduling execution at Collectives block ${executeAtBlock}`);
  console.log(`Setting incompleteSince to ${executeAtBlock}`);

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

  // 2. Store preimage via note_preimage AFTER dev_setStorage
  //    This builds on the modified state, so both coexist
  const collectivesSigner = createAliceSigner();
  await clients.collectivesApi.tx.Preimage.note_preimage({
    bytes: callData,
  }).signAndSubmit(collectivesSigner);
  console.log("Preimage stored on Collectives");

  // Verify
  const agenda = await clients.collectivesApi.query.Scheduler.Agenda.getValue(executeAtBlock);
  console.log(`Agenda at block ${executeAtBlock}: ${agenda.length} entries`);

  console.log(`Batch call scheduled for Collectives block ${executeAtBlock} with Architects origin`);

  return {
    executeAtBlock,
    hash: hashHex,
    size: callSize,
  };
}
