/**
 * Civil Sarabande Game Server
 * Entry point: validate configuration, start the server, handle shutdown.
 */

import { validateServerEnv } from "./config/env";
import { startServer } from "./server";
import { createLogger } from "./utils/logger";

const logger = createLogger("server/index");

const config = validateServerEnv();
logger.info("Civil Sarabande server starting", {
  port: config.port,
  authMode: config.authMode,
  chainId: config.chainId,
  settlementEnabled: config.settlementEnabled,
});

const running = startServer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);
  await running.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
