/**
 * Contract Service (Frontend)
 *
 * Handles blockchain contract interactions using Privy wallet.
 */

import { createWalletClient, custom, type Address, type Hash } from "viem";
import { baseSepolia } from "viem/chains";
import { getAccessToken } from "./privy";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// GameEscrow ABI (minimal interface)
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
] as const;

// USDC ABI for approval
const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const USDC_DECIMALS = 6;
const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS as Address;
const USDC_CONTRACT_ADDRESS = import.meta.env.VITE_USDC_CONTRACT_ADDRESS as Address;

/**
 * Get wallet client using Privy provider
 * Note: This requires the Privy provider to be available via useWallets hook
 * For now, we'll get it from the Privy React context
 */
async function getWalletClient() {
  // Try to get provider from Privy
  // Privy exposes the provider through the useWallets hook
  // For contract interactions, we need to use Privy's wallet connection
  const privyProvider = (window as any).ethereum || (window as any).privyProvider;
  
  if (!privyProvider) {
    // Fallback: try to get from Privy's embedded wallet
    const privy = (window as any).privy;
    if (privy && privy.getEthereumProvider) {
      const provider = await privy.getEthereumProvider();
      if (provider) {
        return createWalletClient({
          chain: baseSepolia,
          transport: custom(provider),
        });
      }
    }
    throw new Error("Wallet not connected. Please connect your wallet first.");
  }

  return createWalletClient({
    chain: baseSepolia,
    transport: custom(privyProvider),
  });
}

/**
 * Approve USDC spending for escrow contract
 */
export async function approveUSDC(amount: number): Promise<Hash> {
  const client = await getWalletClient();
  const amountWei = BigInt(amount * 10 ** USDC_DECIMALS);

  const hash = await client.writeContract({
    address: USDC_CONTRACT_ADDRESS,
    abi: USDC_ABI,
    functionName: "approve",
    args: [ESCROW_CONTRACT_ADDRESS, amountWei],
  });

  return hash;
}

/**
 * Check USDC allowance
 */
export async function checkUSDCAllowance(owner: Address): Promise<bigint> {
  // Get provider similar to getWalletClient
  const privyProvider = (window as any).ethereum || (window as any).privyProvider;
  if (!privyProvider) {
    const privy = (window as any).privy;
    if (privy && privy.getEthereumProvider) {
      const provider = await privy.getEthereumProvider();
      if (provider) {
        const { createPublicClient } = await import("viem");
        const client = createPublicClient({
          chain: baseSepolia,
          transport: custom(provider),
        });
        
        const allowance = await client.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: USDC_ABI,
          functionName: "allowance",
          args: [owner, ESCROW_CONTRACT_ADDRESS],
        });
        
        return allowance;
      }
    }
    throw new Error("Wallet not connected");
  }

  const { createPublicClient } = await import("viem");
  const client = createPublicClient({
    chain: baseSepolia,
    transport: custom(privyProvider),
  });

  const allowance = await client.readContract({
    address: USDC_CONTRACT_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: [owner, ESCROW_CONTRACT_ADDRESS],
  });

  return allowance;
}

/**
 * Prepare and send createGame transaction
 */
export async function createGameOnChain(
  serverGameId: string,
  stake: number
): Promise<Hash> {
  const client = await getWalletClient();
  const stakeWei = BigInt(stake * 10 ** USDC_DECIMALS);

  const hash = await client.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: GAME_ESCROW_ABI,
    functionName: "createGame",
    args: [serverGameId, stakeWei],
  });

  return hash;
}

/**
 * Prepare and send joinGame transaction
 */
export async function joinGameOnChain(gameId: `0x${string}`): Promise<Hash> {
  const client = await getWalletClient();

  const hash = await client.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: GAME_ESCROW_ABI,
    functionName: "joinGame",
    args: [gameId],
  });

  return hash;
}

/**
 * Prepare and send depositBet transaction
 */
export async function depositBetOnChain(
  gameId: `0x${string}`,
  amount: number
): Promise<Hash> {
  const client = await getWalletClient();
  const amountWei = BigInt(amount * 10 ** USDC_DECIMALS);

  const hash = await client.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: GAME_ESCROW_ABI,
    functionName: "depositBet",
    args: [gameId, amountWei],
  });

  return hash;
}

/**
 * Get transaction preparation data from server
 */
export async function prepareCreateGameTransaction(gameId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/contracts/game/${gameId}/prepare-create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to prepare transaction");
  }

  return response.json();
}

export async function prepareJoinGameTransaction(gameId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/contracts/game/${gameId}/prepare-join`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to prepare transaction");
  }

  return response.json();
}

export async function prepareBetTransaction(gameId: string, amount: number) {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/contracts/game/${gameId}/prepare-bet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to prepare transaction");
  }

  return response.json();
}
