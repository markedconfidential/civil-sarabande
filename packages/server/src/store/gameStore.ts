/**
 * Game Store
 *
 * Database-backed storage for active games.
 */

import type { GameState, Player } from "@civil-sarabande/shared";
import {
  createGame as createGameState,
  joinGame as joinGameState,
  makeMove as makeMoveState,
  makeBet as makeBetState,
  foldBet as foldBetState,
  makeRevealMove as makeRevealMoveState,
  endRound as endRoundState,
  startNextRound as startNextRoundState,
  leaveGame as leaveGameState,
} from "../game/gameState";
import {
  broadcastGameUpdate,
  notifyPlayerJoined,
  notifyPlayerLeft,
} from "../websocket/gameNotifier";
import { getDatabase } from "../db/database";
import * as gameRepo from "../db/gameRepository";
import * as historyRepo from "../db/gameHistoryRepository";
import { calculateGameAnalytics } from "../db/analytics";

/**
 * Create a new game and store it.
 */
export function createGame(player: Player, stake: number): GameState {
  const game = createGameState(player, stake);
  const db = getDatabase();
  gameRepo.createGame(db, game);
  return game;
}

/**
 * Get a game by ID.
 */
export function getGame(gameId: string): GameState | undefined {
  const db = getDatabase();
  return gameRepo.getGame(db, gameId);
}

/**
 * Update a game in the store.
 */
export function updateGame(game: GameState, startedAt?: number): void {
  const db = getDatabase();
  gameRepo.updateGame(db, game, startedAt);
}

/**
 * Delete a game from the store.
 */
export function deleteGame(gameId: string): boolean {
  const db = getDatabase();
  return gameRepo.deleteGame(db, gameId);
}

/**
 * List all games in "waiting" phase (available to join).
 */
export function listWaitingGames(): GameState[] {
  const db = getDatabase();
  return gameRepo.listWaitingGames(db);
}

/**
 * Find a game that a player is currently in.
 */
export function findGameByPlayer(playerId: string): GameState | undefined {
  const db = getDatabase();
  return gameRepo.findGameByPlayer(db, playerId);
}

/**
 * Join an existing game.
 */
export function joinGame(gameId: string, player: Player): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = joinGameState(game, player);
  const startedAt = Date.now();
  gameRepo.updateGame(db, updated, startedAt);
  gameRepo.setGameStartedAt(db, gameId, startedAt);

  // Notify via WebSocket
  notifyPlayerJoined(updated, player);

  return updated;
}

/**
 * Make a move in a game.
 */
export function makeMove(
  gameId: string,
  playerId: string,
  selfColumn: number,
  otherRow: number
): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeMoveState(game, playerId, selfColumn, otherRow);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "move");

  return updated;
}

/**
 * Make a bet in a game.
 */
export function makeBet(
  gameId: string,
  playerId: string,
  amount: number
): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeBetState(game, playerId, amount);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "bet");

  return updated;
}

/**
 * Fold the current betting round.
 */
export function foldBet(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = foldBetState(game, playerId);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "fold");

  return updated;
}

/**
 * Make a reveal move.
 */
export function makeRevealMove(
  gameId: string,
  playerId: string,
  revealColumn: number
): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeRevealMoveState(game, playerId, revealColumn);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "reveal");

  return updated;
}

/**
 * Signal end of round.
 */
export function endRound(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = endRoundState(game, playerId);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "endRound");

  // Check if game ended and record analytics
  if (updated.phase === "ended") {
    recordGameEnd(db, updated);
  }

  return updated;
}

/**
 * Start the next round.
 */
export function startNextRound(gameId: string): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = startNextRoundState(game);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  broadcastGameUpdate(updated, "nextRound");

  // Check if game ended (player out of coins) and record analytics
  if (updated.phase === "ended") {
    recordGameEnd(db, updated);
  }

  return updated;
}

/**
 * Leave a game.
 */
export function leaveGame(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = gameRepo.getGame(db, gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = leaveGameState(game, playerId);
  gameRepo.updateGame(db, updated);

  // Notify via WebSocket
  notifyPlayerLeft(updated, playerId);

  // Record analytics if game ended
  if (updated.phase === "ended") {
    const whoLeft = playerId === game.player1.id ? "player1" : "player2";
    recordGameEnd(db, updated, whoLeft);
  }

  return updated;
}

/**
 * Clear all games (useful for testing).
 */
export function clearAllGames(): void {
  const db = getDatabase();
  db.exec("DELETE FROM games");
}

/**
 * Get total number of active games.
 */
export function getGameCount(): number {
  const db = getDatabase();
  const stmt = db.prepare("SELECT COUNT(*) as count FROM games");
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Record game end analytics.
 */
function recordGameEnd(
  db: ReturnType<typeof getDatabase>,
  game: GameState,
  whoLeft?: "player1" | "player2"
): void {
  // Get started_at timestamp
  const startedAt = gameRepo.getGameStartedAt(db, game.gameId);
  if (!startedAt) {
    // Game never started (player left in waiting phase)
    // Use created_at as started_at for consistency
    const startedAtFallback = game.createdAt;
    const endedAt = Date.now();
    const analytics = calculateGameAnalytics(
      game,
      startedAtFallback,
      endedAt,
      whoLeft
    );
    historyRepo.insertGameHistory(db, analytics);
    return;
  }

  const endedAt = Date.now();
  const analytics = calculateGameAnalytics(game, startedAt, endedAt, whoLeft);
  historyRepo.insertGameHistory(db, analytics);
}

