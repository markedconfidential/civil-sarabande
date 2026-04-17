/**
 * Wallet Service
 *
 * Server wallet management for signing transactions.
 * Used for payout and cancellation operations.
 */

import { createWalletClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createLogger } from "../utils/logger";

const logger = createLogger("blockchain/walletService");

/**
 * Get the server wallet address
 */
export function getServerWalletAddress(): Address {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY environment variable is required");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  logger.debug("Resolved server wallet address", { address: account.address });
  return account.address;
}

/**
 * Get server wallet client for signing transactions
 */
export function getServerWalletClient() {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY environment variable is required");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  logger.info("Creating server wallet client", {
    address: account.address,
    chain: baseSepolia.id,
    rpcHost: new URL(rpcUrl).host,
  });

  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}
