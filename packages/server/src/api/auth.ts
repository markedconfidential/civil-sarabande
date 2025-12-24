/**
 * Authentication Middleware
 *
 * Verifies Privy authentication tokens and extracts user information.
 */

import { PrivyClient } from "@privy-io/server-auth";

// Initialize Privy client (lazy initialization to allow env vars to load)
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        "PRIVY_APP_ID and PRIVY_APP_SECRET environment variables are required"
      );
    }

    privyClient = new PrivyClient(appId, appSecret);
  }

  return privyClient;
}

/**
 * Verified user information from Privy token.
 */
export interface VerifiedUser {
  /** Privy user ID */
  userId: string;
  /** App ID the token was issued for */
  appId: string;
  /** Token expiration timestamp */
  expiration: number;
}

/**
 * Verify a Privy access token and extract user information.
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer xxx")
 * @returns The verified user info, or null if verification fails
 */
export async function verifyPrivyToken(
  authHeader: string | null
): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const client = getPrivyClient();
    const verifiedClaims = await client.verifyAuthToken(token);

    return {
      userId: verifiedClaims.userId,
      appId: verifiedClaims.appId,
      expiration: verifiedClaims.expiration,
    };
  } catch (error) {
    console.error("Failed to verify Privy token:", error);
    return null;
  }
}

/**
 * Extract the Privy user ID from a request.
 * Returns null if not authenticated.
 *
 * @param req - The incoming request
 * @returns The Privy user ID, or null if not authenticated
 */
export async function getAuthenticatedUserId(
  req: Request
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  const verifiedUser = await verifyPrivyToken(authHeader);
  return verifiedUser?.userId ?? null;
}

/**
 * Authentication error response.
 */
export function unauthorizedResponse(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

/**
 * Get user information from Privy by user ID.
 *
 * @param userId - The Privy user ID
 * @returns The user information, or null if not found
 */
export async function getPrivyUser(userId: string) {
  try {
    const client = getPrivyClient();
    const user = await client.getUser(userId);
    return user;
  } catch (error) {
    console.error("Failed to get Privy user:", error);
    return null;
  }
}

/**
 * Middleware helper to require authentication.
 * Returns the user ID if authenticated, or sends a 401 response.
 *
 * @param req - The incoming request
 * @returns Object with userId or error response
 */
export async function requireAuth(
  req: Request
): Promise<{ userId: string } | { error: Response }> {
  const userId = await getAuthenticatedUserId(req);

  if (!userId) {
    return { error: unauthorizedResponse() };
  }

  return { userId };
}

