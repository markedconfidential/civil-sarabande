/**
 * User API Routes
 *
 * REST API handlers for user management.
 */

import { requireAuth, getAuthenticatedUserId } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";

/**
 * GET /users/me - Get current user info
 *
 * Requires authentication.
 * Returns the user's profile including username and wallet address.
 * Creates a new user record if one doesn't exist.
 */
export async function handleGetCurrentUser(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;
  const db = getDatabase();

  // Get wallet address from request body if provided (for initial sync)
  let walletAddress: string | undefined;
  try {
    const body = await req.clone().json();
    walletAddress = body?.walletAddress;
  } catch {
    // No body or invalid JSON, that's fine
  }

  // Get or create user
  const user = userRepo.getOrCreateUser(db, userId, walletAddress);

  return Response.json({
    user: {
      privyUserId: user.privyUserId,
      username: user.username,
      walletAddress: user.walletAddress,
      needsUsername: !user.username,
      createdAt: user.createdAt,
    },
  });
}

/**
 * POST /users/username - Set or update username
 *
 * Requires authentication.
 * Request body: { username: string }
 */
export async function handleSetUsername(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;

  // Parse request body
  let username: string;
  try {
    const body = await req.json();
    username = body?.username;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate username
  if (!username || typeof username !== "string") {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  // Username validation rules
  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3) {
    return Response.json(
      { error: "Username must be at least 3 characters" },
      { status: 400 }
    );
  }

  if (trimmedUsername.length > 20) {
    return Response.json(
      { error: "Username must be at most 20 characters" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return Response.json(
      { error: "Username can only contain letters, numbers, and underscores" },
      { status: 400 }
    );
  }

  const db = getDatabase();

  // Ensure user exists
  const user = userRepo.getOrCreateUser(db, userId);

  // Check if username is available (unless it's their current username)
  if (user.username !== trimmedUsername) {
    if (!userRepo.isUsernameAvailable(db, trimmedUsername)) {
      return Response.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }
  }

  // Update username
  const success = userRepo.updateUsername(db, userId, trimmedUsername);
  if (!success) {
    return Response.json(
      { error: "Failed to update username" },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    user: {
      privyUserId: user.privyUserId,
      username: trimmedUsername,
      walletAddress: user.walletAddress,
      needsUsername: false,
    },
  });
}

/**
 * GET /users/username/:username - Check username availability
 *
 * Public endpoint (no auth required).
 * Returns whether the username is available.
 */
export function handleCheckUsername(username: string): Response {
  // Validate username format
  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
    return Response.json({ available: false, reason: "Invalid length" });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return Response.json({ available: false, reason: "Invalid characters" });
  }

  const db = getDatabase();
  const isAvailable = userRepo.isUsernameAvailable(db, trimmedUsername);

  return Response.json({
    available: isAvailable,
    username: trimmedUsername,
  });
}

/**
 * POST /users/wallet - Update wallet address
 *
 * Requires authentication.
 * Request body: { walletAddress: string }
 */
export async function handleUpdateWallet(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { userId } = authResult;

  // Parse request body
  let walletAddress: string;
  try {
    const body = await req.json();
    walletAddress = body?.walletAddress;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate wallet address
  if (!walletAddress || typeof walletAddress !== "string") {
    return Response.json(
      { error: "Wallet address is required" },
      { status: 400 }
    );
  }

  // Basic Ethereum address validation
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return Response.json(
      { error: "Invalid wallet address format" },
      { status: 400 }
    );
  }

  const db = getDatabase();

  // Ensure user exists
  userRepo.getOrCreateUser(db, userId);

  // Update wallet address
  const success = userRepo.updateWalletAddress(db, userId, walletAddress);
  if (!success) {
    return Response.json(
      { error: "Failed to update wallet address" },
      { status: 500 }
    );
  }

  const updatedUser = userRepo.getUserByPrivyId(db, userId);

  return Response.json({
    success: true,
    user: {
      privyUserId: updatedUser?.privyUserId,
      username: updatedUser?.username,
      walletAddress: updatedUser?.walletAddress,
      needsUsername: !updatedUser?.username,
    },
  });
}

