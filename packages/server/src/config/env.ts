/**
 * Environment validation and runtime configuration helpers.
 */

import { createLogger } from "../utils/logger";

const logger = createLogger("config/env");

const REQUIRED_ENV_KEYS = [
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "BASE_SEPOLIA_RPC_URL",
  "GAME_ESCROW_CONTRACT_ADDRESS",
  "USDC_CONTRACT_ADDRESS",
  "SERVER_WALLET_PRIVATE_KEY",
] as const;

function parseOrigins(originsRaw: string | undefined): string[] {
  if (!originsRaw) return [];
  return originsRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getAllowedCorsOrigins(): string[] {
  return parseOrigins(process.env.CORS_ALLOWED_ORIGINS);
}

export function validateServerEnv(): void {
  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  }

  if (isProductionEnv()) {
    const origins = getAllowedCorsOrigins();
    if (origins.length === 0) {
      throw new Error(
        "CORS_ALLOWED_ORIGINS must be set in production (comma-separated allowed origins)"
      );
    }
    if (origins.includes("*")) {
      throw new Error("CORS_ALLOWED_ORIGINS must not include '*' in production");
    }
  }

  logger.info("Environment validation complete", {
    nodeEnv: process.env.NODE_ENV || "development",
    hasCorsAllowList: getAllowedCorsOrigins().length > 0,
  });
}

