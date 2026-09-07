/**
 * WebSocket Handler
 *
 * Handles WebSocket connections, messages, and lifecycle events. Every
 * subscribe carries a bearer token (Privy access token or dev:<userId>);
 * the connection's identity comes from that token and nothing else.
 */

import type { ServerWebSocket } from "bun";
import type {
  WSClientMessage,
  WSSubscribeMessage,
  WSUnsubscribeMessage,
  WSSubscribedMessage,
  WSUnsubscribedMessage,
  WSErrorMessage,
  WSPongMessage,
} from "@civil-sarabande/shared";
import {
  registerConnection,
  setPlayerConnection,
  subscribeToGame,
  unsubscribeFromGame,
  handleDisconnect,
  type ConnectionData,
} from "./connectionManager";
import { sendMessage } from "./gameNotifier";
import { toGameStateView } from "../game/view";
import { getPlayerRole } from "../game/gameState";
import { getGame } from "../store/gameStore";
import { authenticateToken } from "../api/auth";
import { createLogger } from "../utils/logger";

const logger = createLogger("websocket/handler");

/**
 * Send an error message to the client.
 */
function sendError(ws: ServerWebSocket<ConnectionData>, error: string, gameId?: string): void {
  const message: WSErrorMessage = { type: "error", error, gameId };
  sendMessage(ws, message);
}

/**
 * Handle a subscribe message. The token is required; a playerId, when
 * present, must match the token's identity.
 */
async function handleSubscribe(
  ws: ServerWebSocket<ConnectionData>,
  message: WSSubscribeMessage
): Promise<void> {
  const { gameId, token, playerId } = message;

  if (typeof gameId !== "string" || !gameId) {
    sendError(ws, "gameId is required");
    return;
  }
  if (typeof token !== "string" || !token) {
    sendError(ws, "Authentication token is required", gameId);
    return;
  }

  const userId = await authenticateToken(token);
  if (!userId) {
    sendError(ws, "Invalid authentication token", gameId);
    return;
  }
  if (playerId !== undefined && playerId !== userId) {
    sendError(ws, "playerId does not match the authenticated user", gameId);
    return;
  }

  const game = getGame(gameId);
  if (!game) {
    sendError(ws, "Game not found", gameId);
    return;
  }

  if (!getPlayerRole(game, userId)) {
    sendError(ws, "Player not in this game", gameId);
    return;
  }

  setPlayerConnection(ws, userId);

  if (!subscribeToGame(ws, gameId)) {
    sendError(ws, "Failed to subscribe to game", gameId);
    return;
  }

  const reply: WSSubscribedMessage = {
    type: "subscribed",
    gameId,
    game: toGameStateView(game, userId),
  };
  sendMessage(ws, reply);

  logger.debug("Player subscribed", { userId, gameId });
}

/**
 * Handle an unsubscribe message.
 */
function handleUnsubscribe(
  ws: ServerWebSocket<ConnectionData>,
  message: WSUnsubscribeMessage
): void {
  const { gameId, playerId } = message;

  if (!ws.data.playerId) {
    sendError(ws, "Not subscribed", gameId);
    return;
  }
  if (playerId !== undefined && ws.data.playerId !== playerId) {
    sendError(ws, "Player ID mismatch", gameId);
    return;
  }

  unsubscribeFromGame(ws, gameId);

  const reply: WSUnsubscribedMessage = { type: "unsubscribed", gameId };
  sendMessage(ws, reply);

  logger.debug("Player unsubscribed", { playerId: ws.data.playerId, gameId });
}

function handlePing(ws: ServerWebSocket<ConnectionData>): void {
  const message: WSPongMessage = { type: "pong", timestamp: Date.now() };
  sendMessage(ws, message);
}

/**
 * Parse and validate a client message.
 */
function parseMessage(data: string | Buffer): WSClientMessage | null {
  try {
    const text = typeof data === "string" ? data : data.toString();
    const message = JSON.parse(text);
    if (!message || typeof message.type !== "string") {
      return null;
    }
    return message as WSClientMessage;
  } catch {
    return null;
  }
}

// ============================================================================
// WebSocket Handlers (exported for use in Bun.serve)
// ============================================================================

export function onOpen(ws: ServerWebSocket<ConnectionData>): void {
  registerConnection(ws);
  logger.debug("WebSocket connection opened");
}

export async function onMessage(
  ws: ServerWebSocket<ConnectionData>,
  data: string | Buffer
): Promise<void> {
  const message = parseMessage(data);

  if (!message) {
    sendError(ws, "Invalid message format");
    return;
  }

  try {
    switch (message.type) {
      case "subscribe":
        await handleSubscribe(ws, message);
        break;

      case "unsubscribe":
        handleUnsubscribe(ws, message);
        break;

      case "ping":
        handlePing(ws);
        break;

      default:
        sendError(ws, `Unknown message type: ${(message as { type: string }).type}`);
    }
  } catch (err) {
    logger.error("WebSocket message handling failed", { error: err });
    sendError(ws, err instanceof Error ? err.message : "Internal error");
  }
}

export function onClose(ws: ServerWebSocket<ConnectionData>): void {
  const playerId = ws.data.playerId;
  handleDisconnect(ws);
  logger.debug("WebSocket connection closed", { playerId });
}

/**
 * Called by the server-level error handler for failures during a socket's
 * lifecycle; drops the connection's subscriptions.
 */
export function onError(ws: ServerWebSocket<ConnectionData>, error: Error): void {
  logger.error("WebSocket error", { error, playerId: ws.data.playerId });
  handleDisconnect(ws);
}
