/**
 * Wallet Service
 *
 * USDC balance checking on Base network.
 */

import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { requireAuth } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";

// USDC contract address on Base
const USDC_CONTRACT_ADDRESS =
  process.env.USDC_CONTRACT_ADDRESS ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// USDC has 6 decimals
const USDC_DECIMALS = 6;

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Create Base public client
function getBaseClient() {
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

/**
 * Get USDC balance for a wallet address.
 *
 * @param walletAddress - The Ethereum wallet address
 * @returns The USDC balance as a string (formatted with decimals)
 */
export async function getUSDCBalance(walletAddress: string): Promise<{
  balance: string;
  balanceRaw: string;
  decimals: number;
}> {
  const client = getBaseClient();

  try {
    const balance = await client.readContract({
      address: USDC_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    return {
      balance: formatUnits(balance, USDC_DECIMALS),
      balanceRaw: balance.toString(),
      decimals: USDC_DECIMALS,
    };
  } catch (error) {
    console.error("Failed to get USDC balance:", error);
    throw new Error("Failed to fetch USDC balance");
  }
}

/**
 * Check if a wallet has sufficient USDC for a game.
 *
 * @param walletAddress - The wallet address
 * @param requiredAmount - The required USDC amount (in human-readable format)
 * @returns Whether the wallet has sufficient balance
 */
export async function hasSufficientUSDC(
  walletAddress: string,
  requiredAmount: number
): Promise<boolean> {
  const { balance } = await getUSDCBalance(walletAddress);
  return parseFloat(balance) >= requiredAmount;
}

/**
 * GET /wallet/balance - Get current user's USDC balance
 * Requires authentication.
 */
export async function handleGetBalance(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }
  const { userId } = authResult;

  const db = getDatabase();
  const user = userRepo.getUserByPrivyId(db, userId);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.walletAddress) {
    return Response.json(
      { error: "No wallet address found. Please complete onboarding." },
      { status: 400 }
    );
  }

  try {
    const { balance, balanceRaw, decimals } = await getUSDCBalance(
      user.walletAddress
    );

    return Response.json({
      walletAddress: user.walletAddress,
      balance,
      balanceRaw,
      decimals,
      symbol: "USDC",
      network: "base",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get balance" },
      { status: 500 }
    );
  }
}

/**
 * Validate that a user has sufficient USDC for game entry.
 *
 * @param userId - The Privy user ID
 * @param requiredAmount - The required USDC amount
 * @returns Object with isValid and error message if invalid
 */
export async function validateGameEntry(
  userId: string,
  requiredAmount: number
): Promise<{ isValid: boolean; error?: string }> {
  const db = getDatabase();
  const user = userRepo.getUserByPrivyId(db, userId);

  if (!user) {
    return { isValid: false, error: "User not found" };
  }

  if (!user.walletAddress) {
    return { isValid: false, error: "No wallet address found" };
  }

  try {
    const hasSufficient = await hasSufficientUSDC(
      user.walletAddress,
      requiredAmount
    );

    if (!hasSufficient) {
      return {
        isValid: false,
        error: `Insufficient USDC balance. Required: ${requiredAmount} USDC`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: "Failed to check USDC balance",
    };
  }
}

