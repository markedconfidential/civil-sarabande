/**
 * User Repository
 *
 * CRUD operations for users in the database.
 */

import type { Database } from "bun:sqlite";

/**
 * User record from the database.
 */
export interface User {
  privyUserId: string;
  username: string | null;
  walletAddress: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Convert database row to User.
 */
function rowToUser(row: Record<string, unknown>): User {
  return {
    privyUserId: row.privy_user_id as string,
    username: (row.username as string) || null,
    walletAddress: (row.wallet_address as string) || null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/**
 * Create a new user in the database.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @param walletAddress - Optional wallet address
 * @returns The created user
 */
export function createUser(
  db: Database,
  privyUserId: string,
  walletAddress?: string
): User {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO users (privy_user_id, username, wallet_address, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?)
  `);

  stmt.run(privyUserId, walletAddress ?? null, now, now);

  return {
    privyUserId,
    username: null,
    walletAddress: walletAddress ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get a user by Privy user ID.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @returns The user, or undefined if not found
 */
export function getUserByPrivyId(
  db: Database,
  privyUserId: string
): User | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE privy_user_id = ?");
  const row = stmt.get(privyUserId) as Record<string, unknown> | undefined;

  if (!row) {
    return undefined;
  }

  return rowToUser(row);
}

/**
 * Get a user by username.
 *
 * @param db - Database connection
 * @param username - Username to look up
 * @returns The user, or undefined if not found
 */
export function getUserByUsername(
  db: Database,
  username: string
): User | undefined {
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
  const row = stmt.get(username) as Record<string, unknown> | undefined;

  if (!row) {
    return undefined;
  }

  return rowToUser(row);
}

/**
 * Check if a username is available.
 *
 * @param db - Database connection
 * @param username - Username to check
 * @returns True if available, false if taken
 */
export function isUsernameAvailable(db: Database, username: string): boolean {
  const stmt = db.prepare("SELECT 1 FROM users WHERE username = ?");
  const row = stmt.get(username);
  return !row;
}

/**
 * Update a user's username.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @param username - New username
 * @returns True if updated, false if user not found or username taken
 */
export function updateUsername(
  db: Database,
  privyUserId: string,
  username: string
): boolean {
  // Check if username is available
  if (!isUsernameAvailable(db, username)) {
    return false;
  }

  const stmt = db.prepare(`
    UPDATE users SET username = ?, updated_at = ?
    WHERE privy_user_id = ?
  `);

  const result = stmt.run(username, Date.now(), privyUserId);
  return result.changes > 0;
}

/**
 * Update a user's wallet address.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @param walletAddress - New wallet address
 * @returns True if updated, false if user not found
 */
export function updateWalletAddress(
  db: Database,
  privyUserId: string,
  walletAddress: string
): boolean {
  const stmt = db.prepare(`
    UPDATE users SET wallet_address = ?, updated_at = ?
    WHERE privy_user_id = ?
  `);

  const result = stmt.run(walletAddress, Date.now(), privyUserId);
  return result.changes > 0;
}

/**
 * Get or create a user.
 * If the user doesn't exist, creates a new one with the given wallet address.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @param walletAddress - Optional wallet address
 * @returns The existing or newly created user
 */
export function getOrCreateUser(
  db: Database,
  privyUserId: string,
  walletAddress?: string
): User {
  const existingUser = getUserByPrivyId(db, privyUserId);
  if (existingUser) {
    // Update wallet address if provided and different
    if (walletAddress && existingUser.walletAddress !== walletAddress) {
      updateWalletAddress(db, privyUserId, walletAddress);
      return {
        ...existingUser,
        walletAddress,
        updatedAt: Date.now(),
      };
    }
    return existingUser;
  }

  return createUser(db, privyUserId, walletAddress);
}

/**
 * Delete a user from the database.
 *
 * @param db - Database connection
 * @param privyUserId - Privy user ID
 * @returns True if deleted, false if user not found
 */
export function deleteUser(db: Database, privyUserId: string): boolean {
  const stmt = db.prepare("DELETE FROM users WHERE privy_user_id = ?");
  const result = stmt.run(privyUserId);
  return result.changes > 0;
}

