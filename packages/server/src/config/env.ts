/**
 * Server configuration.
 *
 * Every process.env read lives here. The rest of the server imports the
 * typed `config` object (lazily loaded and validated on first access) or
 * calls `loadConfig()` explicitly at boot to fail fast with a clear message.
 *
 * See .env.example for the full list of variables.
 */

import { createLogger } from "../utils/logger";

const logger = createLogger("config/env");

export type AuthMode = "privy" | "dev";
export type SupportedChainId = 31337 | 84532;

export interface ServerConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  /** Explicit SQLite path, or undefined for the default under packages/server/data */
  databasePath: string | undefined;
  logLevel: string;
  corsAllowedOrigins: string[];

  authMode: AuthMode;
  privyAppId: string | null;
  privyAppSecret: string | null;

  chainId: SupportedChainId;
  rpcUrl: string;
  escrowAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
  serverWalletPrivateKey: `0x${string}`;
  /** True when the chain variables were supplied and validated */
  chainConfigured: boolean;

  /** Seconds a player has to act before the sweeper forfeits them; 0 disables */
  turnTimeoutSeconds: number;
  /** When false the server never touches the chain (engine-only local play) */
  settlementEnabled: boolean;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_KEY = `0x${"0".repeat(64)}` as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new ConfigError(`${name} must be true or false (got "${raw}")`);
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  { min }: { min: number }
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${name} must be an integer >= ${min} (got "${raw}")`);
  }
  return value;
}

function requireAddress(raw: string | undefined, name: string): `0x${string}` {
  if (!raw) throw new ConfigError(`${name} is required`);
  const value = raw.trim();
  if (!ADDRESS_RE.test(value)) {
    throw new ConfigError(`${name} must be a 0x-prefixed 20-byte hex address`);
  }
  return value as `0x${string}`;
}

function requirePrivateKey(raw: string | undefined, name: string): `0x${string}` {
  if (!raw) throw new ConfigError(`${name} is required`);
  const value = raw.trim();
  if (!PRIVATE_KEY_RE.test(value)) {
    throw new ConfigError(`${name} must be a 0x-prefixed 32-byte hex private key`);
  }
  return value as `0x${string}`;
}

function requireRpcUrl(raw: string | undefined): string {
  if (!raw) throw new ConfigError("RPC_URL (or BASE_SEPOLIA_RPC_URL) is required");
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(`RPC_URL is not a valid URL: ${value}`);
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
    throw new ConfigError(`RPC_URL must use http(s) or ws(s): ${value}`);
  }
  return value;
}

/**
 * Build and validate the configuration from an environment map.
 * Throws ConfigError with a human-readable message on the first problem.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  // ---- auth ---------------------------------------------------------------
  const authModeRaw = (env.AUTH_MODE || "privy").trim().toLowerCase();
  if (authModeRaw !== "privy" && authModeRaw !== "dev") {
    throw new ConfigError(`AUTH_MODE must be "privy" or "dev" (got "${env.AUTH_MODE}")`);
  }
  const authMode = authModeRaw as AuthMode;
  if (authMode === "dev" && isProduction) {
    throw new ConfigError("AUTH_MODE=dev is not allowed when NODE_ENV=production");
  }

  let privyAppId: string | null = null;
  let privyAppSecret: string | null = null;
  if (authMode === "privy") {
    if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
      throw new ConfigError("PRIVY_APP_ID and PRIVY_APP_SECRET are required when AUTH_MODE=privy");
    }
    privyAppId = env.PRIVY_APP_ID;
    privyAppSecret = env.PRIVY_APP_SECRET;
  }

  // ---- play settings ------------------------------------------------------
  const turnTimeoutSeconds = parseInteger(env.TURN_TIMEOUT_SECONDS, 120, "TURN_TIMEOUT_SECONDS", {
    min: 0,
  });
  const settlementEnabled = parseBoolean(env.SETTLEMENT_ENABLED, true, "SETTLEMENT_ENABLED");

  // ---- chain --------------------------------------------------------------
  const chainIdRaw = env.CHAIN_ID;
  let chainId: SupportedChainId = 84532;
  if (chainIdRaw !== undefined && chainIdRaw !== "") {
    const value = Number(chainIdRaw);
    if (value !== 31337 && value !== 84532) {
      throw new ConfigError(`CHAIN_ID must be 31337 (Anvil) or 84532 (Base Sepolia), got "${chainIdRaw}"`);
    }
    chainId = value;
  }

  const rpcRaw = env.RPC_URL || env.BASE_SEPOLIA_RPC_URL;
  const chainVarsPresent = Boolean(
    rpcRaw ||
      env.GAME_ESCROW_CONTRACT_ADDRESS ||
      env.USDC_CONTRACT_ADDRESS ||
      env.SERVER_WALLET_PRIVATE_KEY
  );

  let rpcUrl = "";
  let escrowAddress: `0x${string}` = ZERO_ADDRESS;
  let usdcAddress: `0x${string}` = ZERO_ADDRESS;
  let serverWalletPrivateKey: `0x${string}` = ZERO_KEY;
  let chainConfigured = false;

  // With settlement on, the chain must be fully configured. With it off, the
  // chain variables are optional; if any is present they are all validated so
  // /wallet/balance and /dev/faucet can still work.
  if (settlementEnabled || chainVarsPresent) {
    rpcUrl = requireRpcUrl(rpcRaw);
    escrowAddress = requireAddress(env.GAME_ESCROW_CONTRACT_ADDRESS, "GAME_ESCROW_CONTRACT_ADDRESS");
    usdcAddress = requireAddress(env.USDC_CONTRACT_ADDRESS, "USDC_CONTRACT_ADDRESS");
    serverWalletPrivateKey = requirePrivateKey(env.SERVER_WALLET_PRIVATE_KEY, "SERVER_WALLET_PRIVATE_KEY");
    chainConfigured = true;
  }

  // ---- http ---------------------------------------------------------------
  const port = parseInteger(env.PORT, 3001, "PORT", { min: 1 });
  const corsAllowedOrigins = parseOrigins(env.CORS_ALLOWED_ORIGINS);
  if (isProduction) {
    if (corsAllowedOrigins.length === 0) {
      throw new ConfigError(
        "CORS_ALLOWED_ORIGINS must be set in production (comma-separated allowed origins)"
      );
    }
    if (corsAllowedOrigins.includes("*")) {
      throw new ConfigError("CORS_ALLOWED_ORIGINS must not include '*' in production");
    }
  }

  return {
    nodeEnv,
    isProduction,
    port,
    databasePath: env.DATABASE_PATH || undefined,
    logLevel: env.LOG_LEVEL || "info",
    corsAllowedOrigins,
    authMode,
    privyAppId,
    privyAppSecret,
    chainId,
    rpcUrl,
    escrowAddress,
    usdcAddress,
    serverWalletPrivateKey,
    chainConfigured,
    turnTimeoutSeconds,
    settlementEnabled,
  };
}

let cached: ServerConfig | null = null;

/** The validated configuration, loaded on first use. */
export function getConfig(): ServerConfig {
  if (!cached) {
    cached = loadConfig();
    logger.info("Configuration loaded", {
      nodeEnv: cached.nodeEnv,
      authMode: cached.authMode,
      chainId: cached.chainId,
      settlementEnabled: cached.settlementEnabled,
      chainConfigured: cached.chainConfigured,
      turnTimeoutSeconds: cached.turnTimeoutSeconds,
      hasCorsAllowList: cached.corsAllowedOrigins.length > 0,
    });
  }
  return cached;
}

/** Drop the cached configuration so the next access re-reads process.env (tests). */
export function resetConfig(): void {
  cached = null;
}

/**
 * Typed configuration object. Property reads go through getConfig(), so the
 * environment is only read (and validated) the first time it is needed.
 */
export const config: ServerConfig = new Proxy({} as ServerConfig, {
  get(_target, key) {
    return getConfig()[key as keyof ServerConfig];
  },
  has(_target, key) {
    return key in getConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getConfig());
  },
  getOwnPropertyDescriptor(_target, key) {
    const value = getConfig()[key as keyof ServerConfig];
    return { value, enumerable: true, configurable: true, writable: false };
  },
});

/** Validate the environment eagerly (called once at boot). */
export function validateServerEnv(): ServerConfig {
  return getConfig();
}

export function isProductionEnv(): boolean {
  return getConfig().isProduction;
}

export function getAllowedCorsOrigins(): string[] {
  return getConfig().corsAllowedOrigins;
}
