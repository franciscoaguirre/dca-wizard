/**
 * Network setup for Chopsticks-based testing
 * Connects to pre-spawned Chopsticks instances
 */

import { createClient, type TypedApi } from "polkadot-api";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getWsProvider } from "polkadot-api/ws-provider";
import { dotAh, hydration, collectives } from "@polkadot-api/descriptors";
import { PORTS, ALICE, DOT_UNITS, ACCOUNTS } from "./constants";

export interface ChopsticksClients {
  ahClient: ReturnType<typeof createClient>;
  hydrationClient: ReturnType<typeof createClient>;
  collectivesClient: ReturnType<typeof createClient>;
  ahApi: TypedApi<typeof dotAh>;
  hydrationApi: TypedApi<typeof hydration>;
  collectivesApi: TypedApi<typeof collectives>;
  cleanup: () => Promise<void>;
}

/**
 * Connect to pre-spawned Chopsticks instances
 */
export async function setupChopsticksNetwork(): Promise<ChopsticksClients> {
  console.log("Connecting to Chopsticks networks...");

  // Create clients for each network
  const ahClient = createClient(
    withPolkadotSdkCompat(getWsProvider(`ws://localhost:${PORTS.ASSET_HUB}`))
  );

  const hydrationClient = createClient(
    withPolkadotSdkCompat(getWsProvider(`ws://localhost:${PORTS.HYDRATION}`))
  );

  const collectivesClient = createClient(
    withPolkadotSdkCompat(getWsProvider(`ws://localhost:${PORTS.COLLECTIVES}`))
  );

  // Create typed APIs
  const ahApi = ahClient.getTypedApi(dotAh);
  const hydrationApi = hydrationClient.getTypedApi(hydration);
  const collectivesApi = collectivesClient.getTypedApi(collectives);

  // Wait for clients to be ready
  console.log("Waiting for clients to connect...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // Test connection by getting block numbers
    const [assetHubBlock, hydrationBlock, collectivesBlock] = await Promise.all([
      ahApi.query.System.Number.getValue(),
      hydrationApi.query.System.Number.getValue(),
      collectivesApi.query.System.Number.getValue(),
    ]);
    console.log("All clients connected successfully");
    console.log(
      `Block numbers - Asset Hub: ${assetHubBlock}, Hydration: ${hydrationBlock}, Collectives: ${collectivesBlock}`
    );
  } catch (error) {
    console.error("Failed to connect to clients:", error);
    throw error;
  }

  return {
    ahClient,
    hydrationClient,
    collectivesClient,
    ahApi,
    hydrationApi,
    collectivesApi,
    cleanup: async () => {
      console.log("Cleaning up connections...");
      ahClient.destroy();
      hydrationClient.destroy();
      collectivesClient.destroy();
    },
  };
}

/**
 * Get current block numbers from all chains
 */
export async function getCurrentBlocks(clients: ChopsticksClients) {
  const [assetHubBlock, hydrationBlock, collectivesBlock] = await Promise.all([
    clients.ahApi.query.System.Number.getValue(),
    clients.hydrationApi.query.System.Number.getValue(),
    clients.collectivesApi.query.System.Number.getValue(),
  ]);

  console.log("Current blocks:");
  console.log(`  Asset Hub: ${assetHubBlock}`);
  console.log(`  Hydration: ${hydrationBlock}`);
  console.log(`  Collectives: ${collectivesBlock}`);

  return {
    assetHub: Number(assetHubBlock),
    hydration: Number(hydrationBlock),
    collectives: Number(collectivesBlock),
  };
}

/**
 * Advance blocks on all networks.
 * Uses batching to avoid heartbeat timeouts in chopsticks xcm mode
 * (all chains share one process, so long block builds block other WS servers).
 * Advances one block at a time to avoid heartbeat timeouts.
 */
export async function advanceAllBlocks(
  clients: ChopsticksClients,
  count: number
) {
  console.log(`Advancing ${count} blocks on all networks...`);

  // Advance sequentially to avoid heartbeat timeouts in Chopsticks XCM mode
  // (all chains share one process, so parallel block builds block other WS servers)
  for (let i = 0; i < count; i++) {
    await clients.ahClient._request("dev_newBlock", [{ count: 1 }]);
    await clients.hydrationClient._request("dev_newBlock", [{ count: 1 }]);
    await clients.collectivesClient._request("dev_newBlock", [{ count: 1 }]);
  }

  console.log(`Advanced ${count} blocks on all networks`);
}

/**
 * Advance blocks only on Asset Hub
 */
export async function advanceAssetHubBlocks(
  clients: ChopsticksClients,
  count: number
) {
  for (let i = 0; i < count; i++) {
    await clients.ahClient._request("dev_newBlock", [{ count: 1 }]);
  }
}

/**
 * Advance blocks only on Collectives
 */
export async function advanceCollectivesBlocks(
  clients: ChopsticksClients,
  count: number
) {
  for (let i = 0; i < count; i++) {
    await clients.collectivesClient._request("dev_newBlock", [{ count: 1 }]);
  }
}

/**
 * Advance blocks only on Hydration
 */
export async function advanceHydrationBlocks(
  clients: ChopsticksClients,
  count: number
) {
  for (let i = 0; i < count; i++) {
    await clients.hydrationClient._request("dev_newBlock", [{ count: 1 }]);
  }
}

/**
 * Fund Alice's account on Asset Hub
 */
export async function fundAliceAccount(clients: ChopsticksClients) {
  console.log("Funding Alice's account on Asset Hub...");

  await clients.ahClient._request("dev_setStorage", [
    {
      system: {
        account: [
          [
            [ALICE],
            {
              nonce: 0,
              consumers: 0,
              providers: 1,
              sufficients: 0,
              data: {
                free: "10000000000000000000", // 1,000,000,000 DOT
                reserved: "0",
                frozen: "0",
              },
            },
          ],
        ],
      },
    },
  ]);

  console.log("Alice's account funded with 1,000,000,000 DOT");

  // Verify the funding worked
  try {
    const balance = await clients.ahApi.query.System.Account.getValue(ALICE);
    console.log(
      `Alice's balance: ${Number(balance.data.free) / Number(DOT_UNITS)} DOT`
    );
  } catch (error) {
    console.log("Could not verify balance:", error);
  }
}

/**
 * Fund the treasury account with DOT on Asset Hub
 */
export async function fundTreasuryAccount(
  clients: ChopsticksClients,
  amount: bigint = 1_000_000n * DOT_UNITS
) {
  console.log("Funding Treasury account on Asset Hub...");

  await clients.ahClient._request("dev_setStorage", [
    {
      system: {
        account: [
          [
            [ACCOUNTS.FELLOWSHIP_TREASURY],
            {
              nonce: 0,
              consumers: 0,
              providers: 1,
              sufficients: 0,
              data: {
                free: amount.toString(),
                reserved: "0",
                frozen: "0",
              },
            },
          ],
        ],
      },
    },
  ]);

  console.log(
    `Treasury account funded with ${Number(amount) / Number(DOT_UNITS)} DOT`
  );
}
