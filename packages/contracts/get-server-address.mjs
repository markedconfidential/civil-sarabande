#!/usr/bin/env bun
/**
 * Print the address for the server wallet private key.
 *
 * The key is read from the SERVER_WALLET_PRIVATE_KEY environment variable and
 * never from argv, so it does not end up in shell history or process listings.
 *
 *   SERVER_WALLET_PRIVATE_KEY=0x... bun get-server-address.mjs
 */
import { privateKeyToAccount } from "viem/accounts";

const raw = process.env.SERVER_WALLET_PRIVATE_KEY;

if (!raw) {
  console.error("SERVER_WALLET_PRIVATE_KEY is not set.");
  console.error("Usage: SERVER_WALLET_PRIVATE_KEY=0x... bun get-server-address.mjs");
  process.exit(1);
}

const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;

try {
  const account = privateKeyToAccount(privateKey);
  console.log(account.address);
} catch (error) {
  console.error("Invalid private key:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
