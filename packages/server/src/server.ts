/**
 * HTTP + WebSocket server.
 *
 * `startServer()` builds the Bun server from the validated config, starts
 * the turn-timeout sweeper and re-enqueues unsettled games. index.ts calls
 * it at boot; the end-to-end test calls it in-process.
 */

import {
  handleCreateGame,
  handleListWaitingGames,
  handleGetMyGame,
  handleGetGame,
  handleConfirmFunding,
  handleJoinGame,
  handleCancelGame,
  handleMakeMove,
  handleMakeBet,
  handleFold,
  handleRevealMove,
  handleEndRound,
  handleNextRound,
  handleLeaveGame,
} from "./api/routes";
import {
  handleGetCurrentUser,
  handleSetUsername,
  handleCheckUsername,
  handleUpdateWallet,
} from "./api/userRoutes";
import { handleGetBalance } from "./api/wallet";
import { handleFaucet } from "./api/devRoutes";
import { handleGetConfig } from "./api/configRoute";
import { onOpen, onMessage, onClose, type ConnectionData } from "./websocket";
import { getDatabase, closeDatabase } from "./db/database";
import { getConfig } from "./config/env";
import { setTurnTimeoutMs } from "./game/clock";
import { startTimeoutSweeper, stopTimeoutSweeper } from "./game/timeouts";
import { getSettlementWorker, reenqueuePendingSettlements } from "./blockchain/settlement";
import { createLogger } from "./utils/logger";

const logger = createLogger("server");

const ENDPOINTS = {
  health: "GET /health",
  config: "GET /config",
  websocket: "WS /ws",
  // User management
  getCurrentUser: "GET /users/me",
  setUsername: "POST /users/username",
  checkUsername: "GET /users/username/:username",
  updateWallet: "POST /users/wallet",
  // Wallet
  getBalance: "GET /wallet/balance",
  // Game management
  createGame: "POST /games",
  listWaitingGames: "GET /games/waiting",
  myGame: "GET /games/mine",
  getGame: "GET /games/:id",
  confirmFunding: "POST /games/:id/confirm-funding",
  joinGame: "POST /games/:id/join",
  cancelGame: "POST /games/:id/cancel",
  makeMove: "POST /games/:id/move",
  makeBet: "POST /games/:id/bet",
  fold: "POST /games/:id/fold",
  reveal: "POST /games/:id/reveal",
  endRound: "POST /games/:id/end-round",
  nextRound: "POST /games/:id/next-round",
  leaveGame: "POST /games/:id/leave",
  // Dev only
  faucet: "POST /dev/faucet",
};

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}

/** Dispatch a request to its handler (no CORS, no error wrapping). */
export async function route(req: Request, pathname: string): Promise<Response> {
  const method = req.method;

  if (pathname === "/health") {
    return Response.json({ status: "ok", timestamp: Date.now() });
  }
  if (pathname === "/" && method === "GET") {
    return Response.json({ name: "Civil Sarabande API", version: "0.4.0", endpoints: ENDPOINTS });
  }
  if (pathname === "/config" && method === "GET") {
    return handleGetConfig();
  }

  // User routes
  if (pathname === "/users/me" && method === "GET") return handleGetCurrentUser(req);
  if (pathname === "/users/username" && method === "POST") return handleSetUsername(req);
  if (pathname.startsWith("/users/username/") && method === "GET") {
    return handleCheckUsername(decodeURIComponent(pathname.substring("/users/username/".length)));
  }
  if (pathname === "/users/wallet" && method === "POST") return handleUpdateWallet(req);

  // Wallet
  if (pathname === "/wallet/balance" && method === "GET") return handleGetBalance(req);

  // Dev only
  if (pathname === "/dev/faucet" && method === "POST") return handleFaucet(req);
  if (pathname.startsWith("/dev/")) return notFound();

  // Games
  if (pathname === "/games/waiting" && method === "GET") return handleListWaitingGames();
  if (pathname === "/games/mine" && method === "GET") return handleGetMyGame(req);
  if (pathname === "/games" && method === "POST") return handleCreateGame(req);

  if (pathname.startsWith("/games/")) {
    if (method === "GET" && /^\/games\/[^/]+$/.test(pathname)) return handleGetGame(req, pathname);
    if (method !== "POST") return notFound();

    const action = pathname.match(/^\/games\/[^/]+\/([^/]+)$/)?.[1];
    switch (action) {
      case "confirm-funding":
        return handleConfirmFunding(req, pathname);
      case "join":
        return handleJoinGame(req, pathname);
      case "cancel":
        return handleCancelGame(req, pathname);
      case "move":
        return handleMakeMove(req, pathname);
      case "bet":
        return handleMakeBet(req, pathname);
      case "fold":
        return handleFold(req, pathname);
      case "reveal":
        return handleRevealMove(req, pathname);
      case "end-round":
        return handleEndRound(req, pathname);
      case "next-round":
        return handleNextRound(req, pathname);
      case "leave":
        return handleLeaveGame(req, pathname);
      default:
        return notFound();
    }
  }

  return notFound();
}

export interface RunningServer {
  server: ReturnType<typeof Bun.serve<ConnectionData>>;
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export interface StartOptions {
  /** Override the configured port (0 picks a free port) */
  port?: number;
  /** Start the timeout sweeper (default true) */
  sweeper?: boolean;
}

export function startServer(options: StartOptions = {}): RunningServer {
  const config = getConfig();
  const port = options.port ?? config.port;
  const allowedCorsOrigins = new Set(config.corsAllowedOrigins);

  function resolveAllowedOrigin(requestOrigin: string | null): string | null {
    if (!config.isProduction) return "*";
    if (!requestOrigin) return null;
    return allowedCorsOrigins.has(requestOrigin) ? requestOrigin : null;
  }

  getDatabase();
  setTurnTimeoutMs(config.turnTimeoutSeconds * 1000);
  if (options.sweeper !== false) {
    startTimeoutSweeper();
  }
  if (config.settlementEnabled) {
    const count = reenqueuePendingSettlements();
    if (count > 0) logger.info("Re-enqueued unsettled games", { count });
  }

  const server = Bun.serve<ConnectionData>({
    port,

    async fetch(req, bunServer) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;
      const requestOrigin = req.headers.get("Origin");
      const allowedOrigin = resolveAllowedOrigin(requestOrigin);

      if (config.isProduction && requestOrigin && !allowedOrigin) {
        logger.warn("Blocked request from disallowed origin", { origin: requestOrigin, pathname, method });
        return Response.json({ error: "Origin not allowed" }, { status: 403 });
      }

      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": allowedOrigin ?? "null",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
      };

      if (method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (pathname === "/ws") {
        const upgraded = bunServer.upgrade(req, {
          data: { playerId: null, subscribedGames: new Set<string>() },
        });
        if (upgraded) return undefined;
        return Response.json({ error: "WebSocket upgrade failed" }, { status: 400, headers: corsHeaders });
      }

      try {
        const response = await route(req, pathname);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (err) {
        logger.error("Unhandled server error", { error: err, pathname, method });
        return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
      }
    },

    error(err) {
      logger.error("Server error", { error: err });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    },

    websocket: {
      open: onOpen,
      message: onMessage,
      close: onClose,
    },
  });

  const actualPort = server.port ?? port;
  logger.info("Server running", { url: `http://localhost:${actualPort}` });

  return {
    server,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    stop: async () => {
      stopTimeoutSweeper();
      getSettlementWorker().stop();
      server.stop(true);
      closeDatabase();
    },
  };
}
