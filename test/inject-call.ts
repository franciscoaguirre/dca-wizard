#!/usr/bin/env npx tsx
/**
 * Inject a (hash, len) lookup into the Collectives scheduler with Architects origin.
 *
 * Usage:
 *   npx tsx test/inject-call.ts --hash 0x437b... --len 399
 *   npx tsx test/inject-call.ts --hash 0x437b... --len 399 --port 8003
 */

import { createClient } from "polkadot-api";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getWsProvider } from "polkadot-api/ws-provider";
import { collectives } from "@polkadot-api/descriptors";

function parseArgs() {
  const args = process.argv.slice(2);
  let hash: string | null = null;
  let len: number | null = null;
  let port = 8003;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hash" && args[i + 1]) {
      hash = args[i + 1];
      i++;
    } else if (args[i] === "--len" && args[i + 1]) {
      len = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1]);
      i++;
    }
  }

  if (!hash || len === null) {
    console.error("Usage: npx tsx test/inject-call.ts --hash 0x... --len <bytes>");
    process.exit(1);
  }

  return { hash: hash.startsWith("0x") ? hash : `0x${hash}`, len, port };
}

async function main() {
  const { hash, len, port } = parseArgs();

  console.log(`Hash: ${hash}`);
  console.log(`Len:  ${len}`);

  const client = createClient(
    withPolkadotSdkCompat(getWsProvider(`ws://localhost:${port}`))
  );
  const api = client.getTypedApi(collectives);

  await new Promise((r) => setTimeout(r, 1000));
  const currentBlock = await api.query.System.Number.getValue();
  const executeAtBlock = Number(currentBlock) + 1;

  console.log(`Current block: ${currentBlock}`);
  console.log(`Scheduling at block: ${executeAtBlock}`);

  await client._request("dev_setStorage", [
    {
      scheduler: {
        agenda: [
          [
            [executeAtBlock],
            [
              {
                call: { Lookup: { hash, len } },
                origin: { FellowshipOrigins: "Architects" },
              },
            ],
          ],
        ],
        incompleteSince: executeAtBlock,
      },
    },
  ]);

  // Verify
  const agenda = await api.query.Scheduler.Agenda.getValue(executeAtBlock);
  console.log(`\nAgenda at block ${executeAtBlock}: ${agenda.length} entries`);
  for (const entry of agenda) {
    if (entry && entry.call.type === "Lookup") {
      console.log(`  hash:   ${entry.call.value.hash.asHex()}`);
      console.log(`  len:    ${entry.call.value.len}`);
      console.log(`  origin: ${JSON.stringify(entry.origin, (_, v) => typeof v === "bigint" ? v.toString() : v)}`);
    }
  }

  console.log("\nDone. Advance one block to execute.");
  client.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
