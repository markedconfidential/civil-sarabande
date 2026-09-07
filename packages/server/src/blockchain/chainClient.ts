/**
 * Chain client
 *
 * The only module that talks to the chain. Builds viem clients from config
 * for Anvil (31337) or Base Sepolia (84532), reads the escrow, and performs
 * the server-signed writes. Every write goes through the transaction queue,
 * waits for its receipt and throws unless the receipt status is "success".
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Account,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC20_ABI,
  ESCROW_STATUS,
  GAME_ESCROW_ABI,
  MOCK_USDC_ABI,
  type EscrowChainStatus,
} from "@civil-sarabande/shared";
import { config } from "../config/env";
import { txQueue } from "./txQueue";
import { createLogger } from "../utils/logger";

const logger = createLogger("blockchain/chainClient");

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export type EscrowStatusName = keyof typeof ESCROW_STATUS;

const STATUS_NAMES: Record<EscrowChainStatus, EscrowStatusName> = {
  [ESCROW_STATUS.None]: "None",
  [ESCROW_STATUS.Created]: "Created",
  [ESCROW_STATUS.Active]: "Active",
  [ESCROW_STATUS.Settled]: "Settled",
  [ESCROW_STATUS.Cancelled]: "Cancelled",
  [ESCROW_STATUS.TimedOut]: "TimedOut",
};

/** `games[id]` as stored by GameEscrow, with the status decoded. */
export interface EscrowGame {
  player1: Address;
  player2: Address;
  /** Per-player stake in USDC base units */
  stake: bigint;
  totalDeposits: bigint;
  status: EscrowChainStatus;
  statusName: EscrowStatusName;
  createdAt: bigint;
  activatedAt: bigint;
}

export { contractGameIdFor } from "./gameId";

export const anvil: Chain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/** The chain object for CHAIN_ID, with its RPC pointed at RPC_URL. */
export function getChain(): Chain {
  const base = config.chainId === 31337 ? anvil : baseSepolia;
  return {
    ...base,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
}

function assertChainConfigured(): void {
  if (!config.chainConfigured) {
    throw new Error(
      "Chain is not configured: set RPC_URL, GAME_ESCROW_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS and SERVER_WALLET_PRIVATE_KEY"
    );
  }
}

let publicClient: PublicClient | null = null;
let walletClient: WalletClient<Transport, Chain, Account> | null = null;

export function getPublicClient(): PublicClient {
  assertChainConfigured();
  if (!publicClient) {
    publicClient = createPublicClient({ chain: getChain(), transport: http(config.rpcUrl) });
  }
  return publicClient;
}

export function getWalletClient(): WalletClient<Transport, Chain, Account> {
  assertChainConfigured();
  if (!walletClient) {
    walletClient = createWalletClient({
      account: privateKeyToAccount(config.serverWalletPrivateKey),
      chain: getChain(),
      transport: http(config.rpcUrl),
    });
  }
  return walletClient;
}

/** Forget cached clients (tests that change config between cases). */
export function resetChainClients(): void {
  publicClient = null;
  walletClient = null;
}

// ---- reads ------------------------------------------------------------------

export async function readEscrowGame(contractGameId: `0x${string}`): Promise<EscrowGame> {
  const client = getPublicClient();
  const game = await client.readContract({
    address: config.escrowAddress,
    abi: GAME_ESCROW_ABI,
    functionName: "getGame",
    args: [contractGameId],
  });
  const status = game.status as EscrowChainStatus;
  return {
    player1: game.player1,
    player2: game.player2,
    stake: game.stake,
    totalDeposits: game.totalDeposits,
    status,
    statusName: STATUS_NAMES[status] ?? "None",
    createdAt: game.createdAt,
    activatedAt: game.activatedAt,
  };
}

export async function getUsdcBalance(address: Address): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}

// ---- writes -----------------------------------------------------------------

async function sendAndConfirm(label: string, send: () => Promise<Hash>): Promise<Hash> {
  return txQueue.enqueue(label, async () => {
    const hash = await send();
    logger.info("Transaction submitted", { label, hash });
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${label} reverted on chain (tx ${hash})`);
    }
    logger.info("Transaction confirmed", { label, hash, block: receipt.blockNumber.toString() });
    return hash;
  });
}

/** Pay out the escrow for a finished game. Amounts are USDC base units. */
export function settleGame(
  contractGameId: `0x${string}`,
  player1Amount: bigint,
  player2Amount: bigint
): Promise<Hash> {
  return sendAndConfirm(`settleGame(${contractGameId})`, () =>
    getWalletClient().writeContract({
      address: config.escrowAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "settleGame",
      args: [contractGameId, player1Amount, player2Amount],
    })
  );
}

/** Refund both players of a game that never reached settlement. */
export function cancelGame(contractGameId: `0x${string}`): Promise<Hash> {
  return sendAndConfirm(`cancelGame(${contractGameId})`, () =>
    getWalletClient().writeContract({
      address: config.escrowAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "cancelGame",
      args: [contractGameId],
    })
  );
}

/** Mint MockUSDC (local Anvil only). Amount is in base units. */
export function mintMockUsdc(to: Address, amount: bigint): Promise<Hash> {
  return sendAndConfirm(`mint(${to})`, () =>
    getWalletClient().writeContract({
      address: config.usdcAddress,
      abi: MOCK_USDC_ABI,
      functionName: "mint",
      args: [to, amount],
    })
  );
}

export function addressesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
