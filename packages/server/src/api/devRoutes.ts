/**
 * Dev-only routes (AUTH_MODE=dev). Every handler here 404s in privy mode so
 * the routes are indistinguishable from unknown paths in production.
 */

import type { Address } from "viem";
import type { FaucetRequest } from "@civil-sarabande/shared";
import { usdcToUnits } from "@civil-sarabande/shared";
import { requireAuth, isDevAuth } from "./auth";
import { mintMockUsdc } from "../blockchain/chainClient";
import { config } from "../config/env";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/devRoutes");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

/**
 * POST /dev/faucet { address, amount } - mint MockUSDC via the server wallet.
 */
export async function handleFaucet(req: Request): Promise<Response> {
  if (!isDevAuth()) return notFound();

  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;

  let body: Partial<FaucetRequest>;
  try {
    body = (await req.json()) as Partial<FaucetRequest>;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.address !== "string" || !ADDRESS_RE.test(body.address)) {
    return Response.json({ error: "address must be a 0x-prefixed wallet address" }, { status: 400 });
  }

  let units: bigint;
  try {
    if (typeof body.amount !== "number" || !(body.amount > 0)) throw new Error("bad amount");
    units = usdcToUnits(body.amount);
  } catch {
    return Response.json(
      { error: "amount must be a positive USDC amount with at most 6 decimal places" },
      { status: 400 }
    );
  }

  if (!config.chainConfigured) {
    return Response.json({ error: "Chain is not configured on this server" }, { status: 503 });
  }
  if (config.chainId !== 31337) {
    return Response.json({ error: "Faucet is only available on the local Anvil chain" }, { status: 400 });
  }

  try {
    const txHash = await mintMockUsdc(body.address as Address, units);
    logger.info("Faucet mint", { to: body.address, amount: body.amount, txHash });
    return Response.json({
      success: true,
      txHash,
      address: body.address,
      amount: body.amount,
      amountUnits: units.toString(),
    });
  } catch (err) {
    logger.error("Faucet mint failed", { error: err });
    return Response.json(
      { error: `Mint failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 }
    );
  }
}
