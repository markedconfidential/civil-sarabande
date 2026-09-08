/**
 * Game State Notifier
 *
 * Broadcasts game state updates to subscribed WebSocket clients. Every
 * outgoing state goes through the single toGameStateView so each player
 * only ever receives their own masked view.
 */

import type { ServerWebSocket } from "bun";
import type {
  GameState,
  WSServerMessage,
  WSGameStateUpdateMessage,
  WSPlayerJoinedMessage,
  WSPlayerLeftMessage,
  Player,
} from "@civil-sarabande/shared";
import { getGameConnections, type ConnectionData } from "./connectionManager";
import { toGameStateView } from "../game/view";
import { getPlayerRole } from "../game/gameState";
import { createLogger } from "../utils/logger";

const logger = createLogger("websocket/gameNotifier");

export { toGameStateView };

/**
 * Send a message to a WebSocket client.
 */
export function sendMessage(ws: ServerWebSocket<ConnectionData>, message: WSServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    logger.error("Failed to send WebSocket message", { error: err });
  }
}

/** Connections of players who are actually in the game. */
function memberConnections(game: GameState): Array<{
  ws: ServerWebSocket<ConnectionData>;
  playerId: string;
}> {
  const result: Array<{ ws: ServerWebSocket<ConnectionData>; playerId: string }> = [];
  for (const ws of getGameConnections(game.gameId)) {
    const playerId = ws.data.playerId;
    if (!playerId || !getPlayerRole(game, playerId)) continue;
    result.push({ ws, playerId });
  }
  return result;
}

/**
 * Broadcast a game state update to all subscribed players.
 */
export function broadcastGameUpdate(game: GameState, action: string): void {
  for (const { ws, playerId } of memberConnections(game)) {
    const message: WSGameStateUpdateMessage = {
      type: "gameStateUpdate",
      gameId: game.gameId,
      game: toGameStateView(game, playerId),
      action,
    };
    sendMessage(ws, message);
  }
}

/**
 * Notify subscribed players that a player has joined the game.
 */
export function notifyPlayerJoined(game: GameState, player: Player): void {
  for (const { ws, playerId } of memberConnections(game)) {
    const message: WSPlayerJoinedMessage = {
      type: "playerJoined",
      gameId: game.gameId,
      player,
      game: toGameStateView(game, playerId),
    };
    sendMessage(ws, message);
  }
}

/**
 * Notify subscribed players that a player has left the game.
 */
export function notifyPlayerLeft(game: GameState, leftPlayerId: string): void {
  for (const { ws, playerId } of memberConnections(game)) {
    const message: WSPlayerLeftMessage = {
      type: "playerLeft",
      gameId: game.gameId,
      playerId: leftPlayerId,
      game: toGameStateView(game, playerId),
    };
    sendMessage(ws, message);
  }
}

/**
 * Send a game state update to a specific connection.
 */
export function sendGameUpdateToPlayer(
  ws: ServerWebSocket<ConnectionData>,
  game: GameState,
  action: string
): void {
  const playerId = ws.data.playerId;
  if (!playerId || !getPlayerRole(game, playerId)) return;

  const message: WSGameStateUpdateMessage = {
    type: "gameStateUpdate",
    gameId: game.gameId,
    game: toGameStateView(game, playerId),
    action,
  };
  sendMessage(ws, message);
}
