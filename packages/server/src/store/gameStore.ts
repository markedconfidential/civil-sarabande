/**
 * Game Store
 *
 * In-memory storage for active games.
 * Designed for easy future migration to a database.
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

/** In-memory storage for all active games */
const games = new Map<string, GameState>();

/**
 * Create a new game and store it.
 */
export function createGame(player: Player, stake: number): GameState {
  const game = createGameState(player, stake);
  games.set(game.gameId, game);
  return game;
}

/**
 * Get a game by ID.
 */
export function getGame(gameId: string): GameState | undefined {
  return games.get(gameId);
}

/**
 * Update a game in the store.
 */
export function updateGame(game: GameState): void {
  games.set(game.gameId, game);
}

/**
 * Delete a game from the store.
 */
export function deleteGame(gameId: string): boolean {
  return games.delete(gameId);
}

/**
 * List all games in "waiting" phase (available to join).
 */
export function listWaitingGames(): GameState[] {
  return Array.from(games.values()).filter((game) => game.phase === "waiting");
}

/**
 * Find a game that a player is currently in.
 */
export function findGameByPlayer(playerId: string): GameState | undefined {
  return Array.from(games.values()).find(
    (game) =>
      game.player1.id === playerId || game.player2?.id === playerId
  );
}

/**
 * Join an existing game.
 */
export function joinGame(gameId: string, player: Player): GameState {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = joinGameState(game, player);
  games.set(gameId, updated);
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
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeMoveState(game, playerId, selfColumn, otherRow);
  games.set(gameId, updated);
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
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeBetState(game, playerId, amount);
  games.set(gameId, updated);
  return updated;
}

/**
 * Fold the current betting round.
 */
export function foldBet(gameId: string, playerId: string): GameState {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = foldBetState(game, playerId);
  games.set(gameId, updated);
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
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = makeRevealMoveState(game, playerId, revealColumn);
  games.set(gameId, updated);
  return updated;
}

/**
 * Signal end of round.
 */
export function endRound(gameId: string, playerId: string): GameState {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = endRoundState(game, playerId);
  games.set(gameId, updated);
  return updated;
}

/**
 * Start the next round.
 */
export function startNextRound(gameId: string): GameState {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = startNextRoundState(game);
  games.set(gameId, updated);
  return updated;
}

/**
 * Leave a game.
 */
export function leaveGame(gameId: string, playerId: string): GameState {
  const game = games.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }

  const updated = leaveGameState(game, playerId);
  games.set(gameId, updated);

  // Optionally clean up ended games after some time
  if (updated.phase === "ended") {
    // For now, keep the game for result retrieval
    // Could add cleanup logic here later
  }

  return updated;
}

/**
 * Clear all games (useful for testing).
 */
export function clearAllGames(): void {
  games.clear();
}

/**
 * Get total number of active games.
 */
export function getGameCount(): number {
  return games.size;
}

