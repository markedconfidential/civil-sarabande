/**
 * Authentication
 *
 * Two modes, chosen by AUTH_MODE:
 *
 * - privy: bearer tokens are Privy access tokens, verified with the Privy
 *   client. Wallet addresses come from the Privy user record, never from
 *   the client.
 * - dev:   bearer tokens are `dev:<userId>`; anyone can be anyone. Refused
 *   in production by the config loader.
 *
 * The same token forms are accepted in the WebSocket subscribe message.
 */

import { PrivyClient } from "@privy-io/server-auth";
import { config } from "../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/auth");

const DEV_TOKEN_RE = /^dev:([a-zA-Z0-9_-]{1,64})$/;

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (config.authMode !== "privy" || !config.privyAppId || !config.privyAppSecret) {
      throw new Error("Privy is not configured (AUTH_MODE=privy with PRIVY_APP_ID/PRIVY_APP_SECRET)");
    }
    privyClient = new PrivyClient(config.privyAppId, config.privyAppSecret);
  }
  return privyClient;
}

export function isDevAuth(): boolean {
  return config.authMode === "dev";
}

/**
 * Verified user information from a token.
 */
export interface VerifiedUser {
  /** User id (Privy DID in privy mode, the bare id in dev mode) */
  userId: string;
  /** App ID the token was issued for (privy mode) */
  appId: string | null;
  /** Token expiration timestamp (privy mode) */
  expiration: number | null;
}

/** Parse a dev token; null if it is not one (or dev mode is off). */
export function parseDevToken(token: string): string | null {
  if (!isDevAuth()) return null;
  const match = DEV_TOKEN_RE.exec(token);
  return match ? match[1] : null;
}

/**
 * Verify a raw bearer token (without the "Bearer " prefix).
 */
export async function verifyToken(token: string): Promise<VerifiedUser | null> {
  if (!token) return null;

  if (isDevAuth()) {
    const userId = parseDevToken(token);
    return userId ? { userId, appId: null, expiration: null } : null;
  }

  try {
    const claims = await getPrivyClient().verifyAuthToken(token);
    return { userId: claims.userId, appId: claims.appId, expiration: claims.expiration };
  } catch (error) {
    logger.warn("Failed to verify Privy token", { error });
    return null;
  }
}

/** Verify a token and return just the user id (used by the WebSocket layer). */
export async function authenticateToken(token: string): Promise<string | null> {
  const verified = await verifyToken(token);
  return verified?.userId ?? null;
}

/**
 * Verify an Authorization header value (e.g. "Bearer xxx").
 */
export async function verifyPrivyToken(authHeader: string | null): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return verifyToken(authHeader.substring(7).trim());
}

/**
 * Extract the authenticated user id from a request, or null.
 */
export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const verified = await verifyPrivyToken(req.headers.get("Authorization"));
  return verified?.userId ?? null;
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

/**
 * Require authentication. Returns the user id or a 401 response.
 */
export async function requireAuth(req: Request): Promise<{ userId: string } | { error: Response }> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return { error: unauthorizedResponse() };
  }
  return { userId };
}

/**
 * Get user information from Privy by user ID (privy mode only).
 */
export async function getPrivyUser(userId: string) {
  try {
    return await getPrivyClient().getUserById(userId);
  } catch (error) {
    logger.error("Failed to get Privy user", { userId, error });
    return null;
  }
}

/**
 * The Ethereum wallet addresses Privy has on record for a user: the
 * embedded wallet first, then any linked external wallets. In dev mode the
 * list is empty (any well-formed address is accepted there).
 */
export async function getVerifiedWallets(userId: string): Promise<string[]> {
  if (isDevAuth()) return [];

  const user = await getPrivyUser(userId);
  if (!user) return [];

  const wallets: Array<{ address: string; embedded: boolean }> = [];
  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue;
    const chainType = (account as { chainType?: string }).chainType;
    if (chainType && chainType !== "ethereum") continue;
    const address = (account as { address?: string }).address;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) continue;
    const embedded = (account as { walletClientType?: string }).walletClientType === "privy";
    wallets.push({ address, embedded });
  }

  wallets.sort((a, b) => Number(b.embedded) - Number(a.embedded));
  return [...new Set(wallets.map((w) => w.address))];
}
