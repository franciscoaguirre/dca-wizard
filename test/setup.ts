/**
 * Network setup for Chopsticks-based testing
 * Connects to pre-spawned Chopsticks instances
 */

import { createClient, type TypedApi } from "polkadot-api";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getWsProvider } from "polkadot-api/ws-provider";
import { dotAh, hydration } from "@polkadot-api/descriptors";
import { PORTS, ALICE, DOT_UNITS, ACCOUNTS } from "./constants";

export interface ChopsticksClients {
  ahClient: ReturnType<typeof createClient>;
  hydrationClient: ReturnType<typeof createClient>;
  ahApi: TypedApi<typeof dotAh>;
  hydrationApi: TypedApi<typeof hydration>;
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

  // Create typed APIs
  const ahApi = ahClient.getTypedApi(dotAh);
  const hydrationApi = hydrationClient.getTypedApi(hydration);

  // Wait for clients to be ready
  console.log("Waiting for clients to connect...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // Test connection by getting block numbers
    const [assetHubBlock, hydrationBlock] = await Promise.all([
      ahApi.query.System.Number.getValue(),
      hydrationApi.query.System.Number.getValue(),
    ]);
    console.log("All clients connected successfully");
    console.log(
      `Block numbers - Asset Hub: ${assetHubBlock}, Hydration: ${hydrationBlock}`
    );
  } catch (error) {
    console.error("Failed to connect to clients:", error);
    throw error;
  }

  return {
    ahClient,
    hydrationClient,
    ahApi,
    hydrationApi,
    cleanup: async () => {
      console.log("Cleaning up connections...");
      ahClient.destroy();
      hydrationClient.destroy();
    },
  };
}

/**
 * Get current block numbers from all chains
 */
export async function getCurrentBlocks(clients: ChopsticksClients) {
  const [assetHubBlock, hydrationBlock] = await Promise.all([
    clients.ahApi.query.System.Number.getValue(),
    clients.hydrationApi.query.System.Number.getValue(),
  ]);

  console.log("Current blocks:");
  console.log(`  Asset Hub: ${assetHubBlock}`);
  console.log(`  Hydration: ${hydrationBlock}`);

  return {
    assetHub: Number(assetHubBlock),
    hydration: Number(hydrationBlock),
  };
}

/**
 * Advance blocks on all networks
 */
export async function advanceAllBlocks(
  clients: ChopsticksClients,
  count: number
) {
  console.log(`Advancing ${count} blocks on all networks...`);

  await Promise.all([
    clients.ahClient._request("dev_newBlock", [{ count }]),
    clients.hydrationClient._request("dev_newBlock", [{ count }]),
  ]);

  console.log(`Advanced ${count} blocks on all networks`);
}

/**
 * Advance blocks only on Asset Hub
 */
export async function advanceAssetHubBlocks(
  clients: ChopsticksClients,
  count: number
) {
  await clients.ahClient._request("dev_newBlock", [{ count }]);
}

/**
 * Advance blocks only on Hydration
 */
export async function advanceHydrationBlocks(
  clients: ChopsticksClients,
  count: number
) {
  await clients.hydrationClient._request("dev_newBlock", [{ count }]);
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
            [ACCOUNTS.TREASURY],
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
