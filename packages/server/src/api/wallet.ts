/**
 * Wallet routes
 *
 * USDC balance on the same chain, RPC and token contract the escrow uses.
 */

import type { Address } from "viem";
import type { WalletBalanceResponse } from "@civil-sarabande/shared";
import { unitsToUsdc } from "@civil-sarabande/shared";
import { requireAuth } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";
import { getUsdcBalance } from "../blockchain/chainClient";
import { config } from "../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/wallet");

/**
 * GET /wallet/balance - Get current user's USDC balance
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

  if (!config.chainConfigured) {
    return Response.json({ error: "Chain is not configured on this server" }, { status: 503 });
  }

  try {
    const balanceUnits = await getUsdcBalance(user.walletAddress as Address);
    const response: WalletBalanceResponse = {
      address: user.walletAddress,
      balance: unitsToUsdc(balanceUnits),
      balanceUnits: balanceUnits.toString(),
    };
    return Response.json(response);
  } catch (error) {
    logger.error("Failed to fetch USDC balance", { userId, error });
    return Response.json({ error: "Failed to fetch USDC balance" }, { status: 503 });
  }
}
