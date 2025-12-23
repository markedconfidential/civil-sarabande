/**
 * Civil Sarabande Game Server
 * Entry point for the game server
 */

import {
  handleCreateGame,
  handleListWaitingGames,
  handleGetGame,
  handleJoinGame,
  handleMakeMove,
  handleMakeBet,
  handleFold,
  handleRevealMove,
  handleEndRound,
  handleNextRound,
  handleLeaveGame,
} from "./api/routes";
import {
  onOpen,
  onMessage,
  onClose,
  type ConnectionData,
} from "./websocket";
import { getDatabase, closeDatabase } from "./db/database";

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("Civil Sarabande server starting...");

// Initialize database
getDatabase();

const server = Bun.serve<ConnectionData>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    // CORS headers for development
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight requests
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle WebSocket upgrade requests
    if (pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: {
          playerId: null,
          subscribedGames: new Set<string>(),
        },
      });

      if (upgraded) {
        // Upgrade successful, Bun will call the websocket handlers
        return undefined;
      }

      // Upgrade failed
      return Response.json(
        { error: "WebSocket upgrade failed" },
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      let response: Response;

      // Health check endpoint
      if (pathname === "/health") {
        response = Response.json({ status: "ok", timestamp: Date.now() });
      }
      // API info
      else if (pathname === "/" && method === "GET") {
        response = Response.json({
          name: "Civil Sarabande API",
          version: "0.2.0",
          endpoints: {
            health: "GET /health",
            websocket: "WS /ws",
            createGame: "POST /games",
            listWaitingGames: "GET /games/waiting",
            getGame: "GET /games/:id?playerId=xxx",
            joinGame: "POST /games/:id/join",
            makeMove: "POST /games/:id/move",
            makeBet: "POST /games/:id/bet",
            fold: "POST /games/:id/fold",
            reveal: "POST /games/:id/reveal",
            endRound: "POST /games/:id/end-round",
            nextRound: "POST /games/:id/next-round",
            leaveGame: "POST /games/:id/leave",
          },
        });
      }
      // List waiting games
      else if (pathname === "/games/waiting" && method === "GET") {
        response = handleListWaitingGames();
      }
      // Create game
      else if (pathname === "/games" && method === "POST") {
        response = await handleCreateGame(req);
      }
      // Game-specific routes
      else if (pathname.startsWith("/games/")) {
        // Get game state
        if (method === "GET" && pathname.match(/^\/games\/[^/]+$/)) {
          const playerId = url.searchParams.get("playerId");
          response = handleGetGame(pathname, playerId);
        }
        // Join game
        else if (method === "POST" && pathname.endsWith("/join")) {
          response = await handleJoinGame(req, pathname);
        }
        // Make move
        else if (method === "POST" && pathname.endsWith("/move")) {
          response = await handleMakeMove(req, pathname);
        }
        // Make bet
        else if (method === "POST" && pathname.endsWith("/bet")) {
          response = await handleMakeBet(req, pathname);
        }
        // Fold
        else if (method === "POST" && pathname.endsWith("/fold")) {
          response = await handleFold(req, pathname);
        }
        // Reveal move
        else if (method === "POST" && pathname.endsWith("/reveal")) {
          response = await handleRevealMove(req, pathname);
        }
        // End round
        else if (method === "POST" && pathname.endsWith("/end-round")) {
          response = await handleEndRound(req, pathname);
        }
        // Next round
        else if (method === "POST" && pathname.endsWith("/next-round")) {
          response = await handleNextRound(req, pathname);
        }
        // Leave game
        else if (method === "POST" && pathname.endsWith("/leave")) {
          response = await handleLeaveGame(req, pathname);
        }
        // Unknown game route
        else {
          response = Response.json(
            { error: "Not found" },
            { status: 404 }
          );
        }
      }
      // Unknown route
      else {
        response = Response.json(
          { error: "Not found" },
          { status: 404 }
        );
      }

      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      console.error("Unhandled error:", err);
      return Response.json(
        { error: "Internal server error" },
        { status: 500, headers: corsHeaders }
      );
    }
  },

  // WebSocket handlers
  websocket: {
    open: onOpen,
    message: onMessage,
    close: onClose,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log("Available endpoints:");
console.log("  GET  /health");
console.log("  GET  /");
console.log("  WS   /ws");
console.log("  POST /games");
console.log("  GET  /games/waiting");
console.log("  GET  /games/:id?playerId=xxx");
console.log("  POST /games/:id/join");
console.log("  POST /games/:id/move");
console.log("  POST /games/:id/bet");
console.log("  POST /games/:id/fold");
console.log("  POST /games/:id/reveal");
console.log("  POST /games/:id/end-round");
console.log("  POST /games/:id/next-round");
console.log("  POST /games/:id/leave");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down gracefully...");
  closeDatabase();
  process.exit(0);
});
