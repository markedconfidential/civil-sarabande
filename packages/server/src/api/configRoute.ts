/**
 * GET /config - public runtime configuration for the client.
 */

import type { ClientConfigResponse } from "@civil-sarabande/shared";
import { config } from "../config/env";

export function handleGetConfig(): Response {
  const response: ClientConfigResponse = {
    authMode: config.authMode,
    chainId: config.chainId,
    escrowAddress: config.chainConfigured ? config.escrowAddress : "",
    usdcAddress: config.chainConfigured ? config.usdcAddress : "",
    turnTimeoutSeconds: config.turnTimeoutSeconds,
    settlementEnabled: config.settlementEnabled,
  };
  return Response.json(response);
}
