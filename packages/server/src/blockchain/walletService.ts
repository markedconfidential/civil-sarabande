/**
 * Wallet Service
 *
 * The server wallet's identity. The clients that sign with it live in
 * chainClient.ts.
 */

import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config/env";

/** Address of the wallet that signs settlements and cancellations. */
export function getServerWalletAddress(): Address {
  if (!config.chainConfigured) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY is not configured");
  }
  return privateKeyToAccount(config.serverWalletPrivateKey).address;
}
