/**
 * Game State Notifier
 *
 * Broadcasts game state updates to subscribed WebSocket clients.
 */

import type { ServerWebSocket } from "bun";
import type {
  GameState,
  GameStateView,
  WSServerMessage,
  WSGameStateUpdateMessage,
  WSPlayerJoinedMessage,
  WSPlayerLeftMessage,
  Player,
} from "@civil-sarabande/shared";
import {
  getGameConnections,
  getGameSubscribers,
  type ConnectionData,
} from "./connectionManager";

/**
 * Convert internal GameState to player-specific GameStateView.
 * Hides opponent's uncommitted moves and presents coins from player's perspective.
 */
export function toGameStateView(game: GameState, playerId: string): GameStateView {
  const isPlayer1 = game.player1.id === playerId;

  // Calculate committed moves (both players have made equal moves)
  const minMoves = Math.min(game.player1Moves.length, game.player2Moves.length);

  const yourMoves = isPlayer1 ? game.player1Moves : game.player2Moves;
  const theirMoves = isPlayer1
    ? game.player2Moves.slice(0, minMoves)
    : game.player1Moves.slice(0, minMoves);

  return {
    gameId: game.gameId,
    board: game.board,
    phase: game.phase,
    player1: game.player1,
    player2: game.player2,
    roundNumber: game.roundNumber,
    stake: game.stake,
    createdAt: game.createdAt,

    yourCoins: isPlayer1 ? game.player1Coins : game.player2Coins,
    theirCoins: isPlayer1 ? game.player2Coins : game.player1Coins,
    yourPotCoins: isPlayer1 ? game.player1PotCoins : game.player2PotCoins,
    theirPotCoins: isPlayer1 ? game.player2PotCoins : game.player1PotCoins,

    yourBetMade: isPlayer1 ? game.player1BetMade : game.player2BetMade,
    theirBetMade: isPlayer1 ? game.player2BetMade : game.player1BetMade,
    settledPotCoins: game.settledPotCoins,

    yourEndedRound: isPlayer1 ? game.player1EndedRound : game.player2EndedRound,
    theirEndedRound: isPlayer1 ? game.player2EndedRound : game.player1EndedRound,

    yourMoves,
    theirMoves,

    yourRole: isPlayer1 ? "player1" : "player2",
  };
}

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
 * Broadcast a game state update to all subscribed players.
 *
 * @param game - The updated game state
 * @param action - The action that triggered this update
 */
export function broadcastGameUpdate(game: GameState, action: string): void {
  const connections = getGameConnections(game.gameId);

  for (const ws of connections) {
    const playerId = ws.data.playerId;
    if (!playerId) continue;

    // Only send to players actually in this game
    if (game.player1.id !== playerId && game.player2?.id !== playerId) {
      continue;
    }

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
 *
 * @param game - The updated game state
 * @param player - The player who joined
 */
export function notifyPlayerJoined(game: GameState, player: Player): void {
  const connections = getGameConnections(game.gameId);

  for (const ws of connections) {
    const playerId = ws.data.playerId;
    if (!playerId) continue;

    // Only send to players actually in this game
    if (game.player1.id !== playerId && game.player2?.id !== playerId) {
      continue;
    }

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
 *
 * @param game - The updated game state
 * @param leftPlayerId - The ID of the player who left
 */
export function notifyPlayerLeft(game: GameState, leftPlayerId: string): void {
  const connections = getGameConnections(game.gameId);

  for (const ws of connections) {
    const playerId = ws.data.playerId;
    if (!playerId) continue;

    // Send to remaining player in the game
    if (game.player1.id !== playerId && game.player2?.id !== playerId) {
      continue;
    }

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
 * Send a game state update to a specific player.
 *
 * @param ws - The WebSocket connection
 * @param game - The game state
 * @param action - The action that triggered this update
 */
export function sendGameUpdateToPlayer(
  ws: ServerWebSocket<ConnectionData>,
  game: GameState,
  action: string
): void {
  const playerId = ws.data.playerId;
  if (!playerId) return;

  const message: WSGameStateUpdateMessage = {
    type: "gameStateUpdate",
    gameId: game.gameId,
    game: toGameStateView(game, playerId),
    action,
  };

  sendMessage(ws, message);
}

