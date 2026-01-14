/**
 * Contract Service
 *
 * Handles interactions with the GameEscrow smart contract on Base Sepolia.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  keccak256,
  stringToBytes,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// GameEscrow ABI (minimal interface for the functions we need)
const GAME_ESCROW_ABI = [
  {
    name: "createGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serverGameId", type: "string" },
      { name: "stake", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "joinGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "depositBet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "payoutWinner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "cancelGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "getGameBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getGame",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [
      {
        components: [
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "stake", type: "uint256" },
          { name: "player1Deposits", type: "uint256" },
          { name: "player2Deposits", type: "uint256" },
          { name: "isActive", type: "bool" },
          { name: "isCancelled", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
  },
  {
    name: "getGameIdFromServerId",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "serverGameId", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// Get RPC URL from environment
function getRpcUrl(): string {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  return rpcUrl;
}

// Get contract address from environment
function getContractAddress(): Address {
  const address = process.env.GAME_ESCROW_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error("GAME_ESCROW_CONTRACT_ADDRESS environment variable is required");
  }
  return address as Address;
}

// Create public client for read operations
function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(getRpcUrl()),
  });
}

// Create wallet client for write operations (server-signed transactions)
function getWalletClient() {
  const privateKey = process.env.SERVER_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SERVER_WALLET_PRIVATE_KEY environment variable is required");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(getRpcUrl()),
  });
}

/**
 * Convert server game ID to on-chain game ID (bytes32)
 */
export function getGameIdFromServerId(serverGameId: string): `0x${string}` {
  // This matches the contract's keccak256(abi.encodePacked(serverGameId))
  return keccak256(stringToBytes(serverGameId));
}

/**
 * Get game balance from contract
 */
export async function getGameBalance(gameId: `0x${string}`): Promise<string> {
  const client = getPublicClient();
  const contractAddress = getContractAddress();

  try {
    const balance = await client.readContract({
      address: contractAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "getGameBalance",
      args: [gameId],
    });

    return formatUnits(balance, USDC_DECIMALS);
  } catch (error) {
    console.error("Failed to get game balance:", error);
    throw new Error("Failed to get game balance from contract");
  }
}

/**
 * Get game state from contract
 */
export async function getGameState(gameId: `0x${string}`) {
  const client = getPublicClient();
  const contractAddress = getContractAddress();

  try {
    const game = await client.readContract({
      address: contractAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "getGame",
      args: [gameId],
    });

    return {
      player1: game[0],
      player2: game[1],
      stake: formatUnits(game[2], USDC_DECIMALS),
      player1Deposits: formatUnits(game[3], USDC_DECIMALS),
      player2Deposits: formatUnits(game[4], USDC_DECIMALS),
      isActive: game[5],
      isCancelled: game[6],
    };
  } catch (error) {
    console.error("Failed to get game state:", error);
    throw new Error("Failed to get game state from contract");
  }
}

/**
 * Payout winner (server-signed transaction)
 */
export async function payoutWinner(
  gameId: `0x${string}`,
  winnerAddress: Address,
  amount: number // Amount in USDC (human-readable)
): Promise<Hash> {
  const client = getWalletClient();
  const contractAddress = getContractAddress();

  const amountWei = parseUnits(amount.toString(), USDC_DECIMALS);

  try {
    const hash = await client.writeContract({
      address: contractAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "payoutWinner",
      args: [gameId, winnerAddress, amountWei],
    });

    // Wait for transaction confirmation
    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash });

    return hash;
  } catch (error) {
    console.error("Failed to payout winner:", error);
    throw new Error("Failed to payout winner on contract");
  }
}

/**
 * Cancel game (server-signed transaction)
 */
export async function cancelGame(gameId: `0x${string}`): Promise<Hash> {
  const client = getWalletClient();
  const contractAddress = getContractAddress();

  try {
    const hash = await client.writeContract({
      address: contractAddress,
      abi: GAME_ESCROW_ABI,
      functionName: "cancelGame",
      args: [gameId],
    });

    // Wait for transaction confirmation
    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({ hash });

    return hash;
  } catch (error) {
    console.error("Failed to cancel game:", error);
    throw new Error("Failed to cancel game on contract");
  }
}

/**
 * Prepare transaction data for player to sign (for createGame, joinGame, depositBet)
 * Returns the transaction data that the frontend can use to send the transaction
 */
export function prepareCreateGameTransaction(
  serverGameId: string,
  stake: number // Stake in USDC (human-readable)
) {
  const contractAddress = getContractAddress();
  const stakeWei = parseUnits(stake.toString(), USDC_DECIMALS);

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: GAME_ESCROW_ABI,
      functionName: "createGame",
      args: [serverGameId, stakeWei],
    }),
  };
}

export function prepareJoinGameTransaction(gameId: `0x${string}`) {
  const contractAddress = getContractAddress();

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: GAME_ESCROW_ABI,
      functionName: "joinGame",
      args: [gameId],
    }),
  };
}

export function prepareDepositBetTransaction(
  gameId: `0x${string}`,
  amount: number // Amount in USDC (human-readable)
) {
  const contractAddress = getContractAddress();
  const amountWei = parseUnits(amount.toString(), USDC_DECIMALS);

  return {
    to: contractAddress,
    data: encodeFunctionData({
      abi: GAME_ESCROW_ABI,
      functionName: "depositBet",
      args: [gameId, amountWei],
    }),
  };
}

// Helper to encode function data (already imported from viem)
