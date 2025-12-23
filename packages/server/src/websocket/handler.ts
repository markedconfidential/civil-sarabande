/**
 * WebSocket Handler
 *
 * Handles WebSocket connections, messages, and lifecycle events.
 */

import type { ServerWebSocket } from "bun";
import type {
  WSClientMessage,
  WSServerMessage,
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
import { toGameStateView } from "./gameNotifier";
import { getGame } from "../store/gameStore";

/**
 * Send a message to a WebSocket client.
 */
function sendMessage(
  ws: ServerWebSocket<ConnectionData>,
  message: WSServerMessage
): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error("Failed to send WebSocket message:", err);
  }
}

/**
 * Send an error message to the client.
 */
function sendError(
  ws: ServerWebSocket<ConnectionData>,
  error: string,
  gameId?: string
): void {
  const message: WSErrorMessage = {
    type: "error",
    error,
    gameId,
  };
  sendMessage(ws, message);
}

/**
 * Handle a subscribe message.
 */
function handleSubscribe(
  ws: ServerWebSocket<ConnectionData>,
  playerId: string,
  gameId: string
): void {
  // Associate connection with player
  setPlayerConnection(ws, playerId);

  // Get the game
  const game = getGame(gameId);
  if (!game) {
    sendError(ws, "Game not found", gameId);
    return;
  }

  // Verify player is part of this game
  if (game.player1.id !== playerId && game.player2?.id !== playerId) {
    sendError(ws, "Player not in this game", gameId);
    return;
  }

  // Subscribe to the game
  const subscribed = subscribeToGame(ws, gameId);
  if (!subscribed) {
    sendError(ws, "Failed to subscribe to game", gameId);
    return;
  }

  // Send confirmation with current game state
  const message: WSSubscribedMessage = {
    type: "subscribed",
    gameId,
    game: toGameStateView(game, playerId),
  };
  sendMessage(ws, message);

  console.log(`Player ${playerId} subscribed to game ${gameId}`);
}

/**
 * Handle an unsubscribe message.
 */
function handleUnsubscribe(
  ws: ServerWebSocket<ConnectionData>,
  playerId: string,
  gameId: string
): void {
  // Verify player ID matches connection
  if (ws.data.playerId !== playerId) {
    sendError(ws, "Player ID mismatch", gameId);
    return;
  }

  // Unsubscribe from the game
  unsubscribeFromGame(ws, gameId);

  // Send confirmation
  const message: WSUnsubscribedMessage = {
    type: "unsubscribed",
    gameId,
  };
  sendMessage(ws, message);

  console.log(`Player ${playerId} unsubscribed from game ${gameId}`);
}

/**
 * Handle a ping message.
 */
function handlePing(ws: ServerWebSocket<ConnectionData>): void {
  const message: WSPongMessage = {
    type: "pong",
    timestamp: Date.now(),
  };
  sendMessage(ws, message);
}

/**
 * Parse and validate a client message.
 */
function parseMessage(data: string | Buffer): WSClientMessage | null {
  try {
    const text = typeof data === "string" ? data : data.toString();
    const message = JSON.parse(text);

    // Validate message has a type
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

/**
 * Called when a new WebSocket connection is opened.
 */
export function onOpen(ws: ServerWebSocket<ConnectionData>): void {
  registerConnection(ws);
  console.log("WebSocket connection opened");
}

/**
 * Called when a WebSocket message is received.
 */
export function onMessage(
  ws: ServerWebSocket<ConnectionData>,
  data: string | Buffer
): void {
  const message = parseMessage(data);

  if (!message) {
    sendError(ws, "Invalid message format");
    return;
  }

  switch (message.type) {
    case "subscribe":
      handleSubscribe(ws, message.playerId, message.gameId);
      break;

    case "unsubscribe":
      handleUnsubscribe(ws, message.playerId, message.gameId);
      break;

    case "ping":
      handlePing(ws);
      break;

    default:
      sendError(ws, `Unknown message type: ${(message as { type: string }).type}`);
  }
}

/**
 * Called when a WebSocket connection is closed.
 */
export function onClose(ws: ServerWebSocket<ConnectionData>): void {
  const playerId = ws.data.playerId;
  handleDisconnect(ws);
  console.log(`WebSocket connection closed${playerId ? ` (player: ${playerId})` : ""}`);
}

/**
 * Called when a WebSocket error occurs.
 */
export function onError(
  ws: ServerWebSocket<ConnectionData>,
  error: Error
): void {
  console.error("WebSocket error:", error);
  handleDisconnect(ws);
}

