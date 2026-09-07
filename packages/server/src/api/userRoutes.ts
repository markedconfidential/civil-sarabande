/**
 * User API Routes
 *
 * REST API handlers for user management. Wallet addresses are verified
 * against Privy in privy mode; in dev mode any well-formed address is
 * accepted.
 */

import type { SetWalletRequest } from "@civil-sarabande/shared";
import { requireAuth, getVerifiedWallets, isDevAuth } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";
import { addressesEqual } from "../blockchain/chainClient";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/userRoutes");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function userPayload(user: userRepo.User) {
  return {
    privyUserId: user.privyUserId,
    username: user.username,
    walletAddress: user.walletAddress,
    needsUsername: !user.username,
    createdAt: user.createdAt,
  };
}

/**
 * GET /users/me - Get current user info
 *
 * Creates the user record on first sight. In privy mode, stores the user's
 * embedded wallet (first verified wallet) when none is stored yet or the
 * stored one is no longer on the user's verified list.
 */
export async function handleGetCurrentUser(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;
  const db = getDatabase();

  let user = userRepo.getOrCreateUser(db, userId);

  if (!isDevAuth()) {
    const wallets = await getVerifiedWallets(userId);
    const stillValid = wallets.some((w) => addressesEqual(w, user.walletAddress));
    if (wallets.length > 0 && !stillValid) {
      userRepo.updateWalletAddress(db, userId, wallets[0]);
      user = userRepo.getUserByPrivyId(db, userId) ?? user;
      logger.info("Stored verified wallet for user", { userId, wallet: wallets[0] });
    }
  }

  return Response.json({ user: userPayload(user) });
}

/**
 * POST /users/username - Set or update username
 *
 * Request body: { username: string }
 */
export async function handleSetUsername(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;

  let username: unknown;
  try {
    const body = await req.json();
    username = body?.username;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!username || typeof username !== "string") {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }

  if (trimmedUsername.length > 20) {
    return Response.json({ error: "Username must be at most 20 characters" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return Response.json(
      { error: "Username can only contain letters, numbers, and underscores" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const user = userRepo.getOrCreateUser(db, userId);

  if (user.username === trimmedUsername) {
    return Response.json({ success: true, user: userPayload(user) });
  }

  if (!userRepo.isUsernameAvailable(db, trimmedUsername)) {
    return Response.json({ error: "Username is already taken" }, { status: 409 });
  }

  const success = userRepo.updateUsername(db, userId, trimmedUsername);
  if (!success) {
    return Response.json({ error: "Failed to update username" }, { status: 500 });
  }

  const updated = userRepo.getUserByPrivyId(db, userId) ?? { ...user, username: trimmedUsername };
  return Response.json({ success: true, user: userPayload(updated) });
}

/**
 * GET /users/username/:username - Check username availability (public)
 */
export function handleCheckUsername(username: string): Response {
  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
    return Response.json({ available: false, reason: "Invalid length" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return Response.json({ available: false, reason: "Invalid characters" });
  }

  const db = getDatabase();
  const isAvailable = userRepo.isUsernameAvailable(db, trimmedUsername);

  return Response.json({ available: isAvailable, username: trimmedUsername });
}

/**
 * POST /users/wallet - Set the wallet address
 *
 * Request body: { walletAddress: string }. In privy mode the address must
 * be one Privy lists for the user; in dev mode any well-formed address.
 */
export async function handleUpdateWallet(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;

  let walletAddress: unknown;
  try {
    const body = (await req.json()) as Partial<SetWalletRequest>;
    walletAddress = body?.walletAddress;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!walletAddress || typeof walletAddress !== "string") {
    return Response.json({ error: "Wallet address is required" }, { status: 400 });
  }

  if (!ADDRESS_RE.test(walletAddress)) {
    return Response.json({ error: "Invalid wallet address format" }, { status: 400 });
  }

  if (!isDevAuth()) {
    const wallets = await getVerifiedWallets(userId);
    if (!wallets.some((w) => addressesEqual(w, walletAddress))) {
      return Response.json(
        { error: "Wallet address is not linked to your account" },
        { status: 403 }
      );
    }
  }

  const db = getDatabase();
  userRepo.getOrCreateUser(db, userId);

  const success = userRepo.updateWalletAddress(db, userId, walletAddress);
  if (!success) {
    return Response.json({ error: "Failed to update wallet address" }, { status: 500 });
  }

  const updatedUser = userRepo.getUserByPrivyId(db, userId)!;
  return Response.json({ success: true, user: userPayload(updatedUser) });
}
