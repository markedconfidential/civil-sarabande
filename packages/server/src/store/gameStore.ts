/**
 * Game Store
 *
 * Database-backed game operations. Each function loads the game, applies the
 * pure engine transition, persists the result, notifies subscribers, and
 * hands ended games to the settlement worker. The escrow lifecycle
 * (funding, verified join, cancellation, chain reconciliation) lives here
 * as well, because it needs the chain client and the user table.
 */

import type { Database } from "bun:sqlite";
import type { GameState, Player } from "@civil-sarabande/shared";
import { ESCROW_STATUS, usdcToUnits } from "@civil-sarabande/shared";
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
  abandonGame as abandonGameState,
  getPlayerRole,
} from "../game/gameState";
import { ForbiddenError, GameError, NotFoundError, UnavailableError } from "../game/errors";
import {
  broadcastGameUpdate,
  notifyPlayerJoined,
  notifyPlayerLeft,
} from "../websocket/gameNotifier";
import { getDatabase } from "../db/database";
import * as gameRepo from "../db/gameRepository";
import * as historyRepo from "../db/gameHistoryRepository";
import * as userRepo from "../db/userRepository";
import { calculateGameAnalytics } from "../db/analytics";
import { config } from "../config/env";
import {
  addressesEqual,
  cancelGame as cancelGameOnChain,
  readEscrowGame,
  ZERO_ADDRESS,
  type EscrowGame,
} from "../blockchain/chainClient";
import { enqueueSettlement } from "../blockchain/settlement";
import { createLogger } from "../utils/logger";

const logger = createLogger("store/gameStore");

// ============================================================================
// Helpers
// ============================================================================

function loadGame(db: Database, gameId: string): GameState {
  const game = gameRepo.getGame(db, gameId);
  if (!game) throw new NotFoundError();
  return game;
}

function requireMember(game: GameState, playerId: string): "player1" | "player2" {
  const role = getPlayerRole(game, playerId);
  if (!role) throw new ForbiddenError();
  return role;
}

/** Whether the store should consult the chain for escrow transitions. */
function chainVerificationEnabled(): boolean {
  return config.settlementEnabled;
}

async function readEscrowOrThrow(game: GameState): Promise<EscrowGame> {
  try {
    return await readEscrowGame(game.contractGameId);
  } catch (err) {
    logger.error("Failed to read escrow from chain", { gameId: game.gameId, error: err });
    throw new UnavailableError(
      `Could not read the escrow contract: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Bookkeeping for a game that has just reached `ended`: record history and
 * queue settlement when the escrow holds both stakes.
 */
function onGameEnded(db: Database, game: GameState, whoLeft?: "player1" | "player2"): void {
  recordGameEnd(db, game, whoLeft);
  if (game.escrowStatus === "active") {
    if (config.settlementEnabled) {
      enqueueSettlement(game.gameId);
    } else {
      logger.info("Settlement disabled; game ended without touching the chain", {
        gameId: game.gameId,
      });
    }
  }
}

/**
 * Persist and broadcast a play-state transition. Runs the game-ended hook
 * when the transition ends the game.
 */
function commit(
  db: Database,
  updated: GameState,
  action: string,
  options: { whoLeft?: "player1" | "player2"; wasEnded?: boolean } = {}
): GameState {
  gameRepo.updateGame(db, updated);
  broadcastGameUpdate(updated, action);
  if (updated.phase === "ended" && !options.wasEnded) {
    onGameEnded(db, updated, options.whoLeft);
  }
  return updated;
}

// ============================================================================
// Creation and lookup
// ============================================================================

/**
 * Create a new, unfunded game.
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
 * List games that can be joined: waiting, funded, less than an hour old.
 */
export function listWaitingGames(): GameState[] {
  const db = getDatabase();
  return gameRepo.listWaitingGames(db);
}

/**
 * The most recent game a player is in that has not ended.
 */
export function findGameByPlayer(playerId: string): GameState | undefined {
  const db = getDatabase();
  return gameRepo.findGameByPlayer(db, playerId);
}

/**
 * Get a game for one of its players, reconciling a waiting game with the
 * chain first: a funded game whose escrow shows a joined player 2 is
 * auto-joined for the user owning that wallet, and an unfunded game whose
 * escrow shows player 1's deposit is marked funded.
 */
export async function getGameForPlayer(gameId: string, playerId: string): Promise<GameState> {
  const db = getDatabase();
  let game = loadGame(db, gameId);
  requireMember(game, playerId);

  if (game.phase === "waiting" && chainVerificationEnabled() && config.chainConfigured) {
    try {
      game = await reconcileWaitingGame(db, game);
    } catch (err) {
      logger.warn("Chain reconciliation skipped", { gameId, error: err });
    }
  }

  return game;
}

async function reconcileWaitingGame(db: Database, game: GameState): Promise<GameState> {
  if (game.escrowStatus !== "unfunded" && game.escrowStatus !== "funded") return game;

  const escrow = await readEscrowGame(game.contractGameId);

  if (game.escrowStatus === "unfunded") {
    if (
      escrow.status === ESCROW_STATUS.Created &&
      escrow.stake === usdcToUnits(game.stake) &&
      addressesEqual(escrow.player1, game.player1.address)
    ) {
      logger.info("Reconciled unfunded game from chain: funded", { gameId: game.gameId });
      return markFunded(db, game);
    }
    return game;
  }

  if (escrow.status === ESCROW_STATUS.Active && escrow.player2 !== ZERO_ADDRESS) {
    const user = userRepo.getUserByWalletAddress(db, escrow.player2);
    if (!user) {
      logger.warn("Escrow joined by an unknown wallet", {
        gameId: game.gameId,
        player2: escrow.player2,
      });
      return game;
    }
    if (user.privyUserId === game.player1.id) {
      logger.warn("Escrow joined by player 1's own wallet", { gameId: game.gameId });
      return game;
    }
    logger.info("Reconciled waiting game from chain: auto-joining player 2", {
      gameId: game.gameId,
      userId: user.privyUserId,
    });
    return joinGame(
      game.gameId,
      { id: user.privyUserId, name: user.username ?? undefined, address: escrow.player2 },
      { escrow }
    );
  }

  return game;
}

// ============================================================================
// Escrow lifecycle
// ============================================================================

function markFunded(db: Database, game: GameState): GameState {
  const funded: GameState = { ...game, escrowStatus: "funded", settlementError: null };
  gameRepo.updateGame(db, funded);
  broadcastGameUpdate(funded, "funded");
  return funded;
}

/**
 * Player 1 reports that their createGame transaction is mined. Verifies the
 * escrow on chain (unless settlement is disabled) and marks the game funded.
 * Idempotent.
 */
export async function confirmFunding(gameId: string, userId: string): Promise<GameState> {
  const db = getDatabase();
  const game = loadGame(db, gameId);

  if (game.player1.id !== userId) {
    throw new ForbiddenError("Only the game creator can confirm funding");
  }
  if (game.escrowStatus !== "unfunded") {
    return game; // already funded (or further along)
  }
  if (game.phase !== "waiting") {
    throw new GameError(`Cannot confirm funding in phase: ${game.phase}`);
  }

  if (chainVerificationEnabled()) {
    const wallet = game.player1.address;
    if (!wallet) {
      throw new GameError("Set a wallet address before funding a game");
    }
    const escrow = await readEscrowOrThrow(game);
    if (escrow.status === ESCROW_STATUS.None) {
      throw new GameError("Escrow not found on chain for this game; is the createGame transaction mined?");
    }
    if (escrow.status !== ESCROW_STATUS.Created) {
      throw new GameError(`Escrow is in state ${escrow.statusName}, expected Created`);
    }
    if (!addressesEqual(escrow.player1, wallet)) {
      throw new GameError("Escrow was funded by a different wallet than yours");
    }
    if (escrow.stake !== usdcToUnits(game.stake)) {
      throw new GameError("Escrow stake does not match the game stake");
    }
  }

  return markFunded(db, game);
}

/**
 * Join a game as player 2. With settlement enabled, the escrow must show the
 * joiner's wallet as player2 and status Active. Idempotent for the same user.
 */
export async function joinGame(
  gameId: string,
  player: Player,
  options: { escrow?: EscrowGame } = {}
): Promise<GameState> {
  const db = getDatabase();
  const game = loadGame(db, gameId);

  if (game.player2?.id === player.id) {
    return game; // already joined
  }
  if (game.player1.id === player.id) {
    throw new GameError("Cannot join your own game");
  }
  if (game.phase !== "waiting") {
    throw new GameError(`Cannot join game in phase: ${game.phase}`);
  }

  if (chainVerificationEnabled()) {
    if (game.escrowStatus !== "funded") {
      throw new GameError(
        game.escrowStatus === "unfunded"
          ? "Game is not funded yet"
          : `Game cannot be joined (escrow ${game.escrowStatus})`
      );
    }
    if (!player.address) {
      throw new GameError("Set a wallet address before joining a game");
    }
    const escrow = options.escrow ?? (await readEscrowOrThrow(game));
    if (escrow.status !== ESCROW_STATUS.Active) {
      throw new GameError(
        escrow.status === ESCROW_STATUS.Created
          ? "Escrow shows no player 2 deposit yet; is the joinGame transaction mined?"
          : `Escrow is in state ${escrow.statusName}, expected Active`
      );
    }
    if (!addressesEqual(escrow.player2, player.address)) {
      throw new GameError("Escrow was joined by a different wallet than yours");
    }
  } else if (game.escrowStatus !== "unfunded" && game.escrowStatus !== "funded") {
    throw new GameError(`Game cannot be joined (escrow ${game.escrowStatus})`);
  }

  const joined: GameState = { ...joinGameState(game, player), escrowStatus: "active" };
  const startedAt = Date.now();
  gameRepo.updateGame(db, joined, startedAt);

  notifyPlayerJoined(joined, player);
  broadcastGameUpdate(joined, "join");

  return joined;
}

/**
 * Player 1 cancels a game nobody has joined. A funded game is refunded on
 * chain first; an unfunded game is simply deleted. Returns the final view
 * state (phase ended, escrow cancelled).
 */
export async function cancelGame(gameId: string, userId: string): Promise<GameState> {
  const db = getDatabase();
  const game = loadGame(db, gameId);

  if (game.player1.id !== userId) {
    throw new ForbiddenError("Only the game creator can cancel");
  }
  if (game.phase !== "waiting") {
    throw new GameError(`Cannot cancel a game in phase: ${game.phase}`);
  }

  const cancelled: GameState = {
    ...game,
    phase: "ended",
    phaseDeadline: null,
    escrowStatus: "cancelled",
  };

  if (game.escrowStatus === "unfunded") {
    gameRepo.deleteGame(db, gameId);
    broadcastGameUpdate(cancelled, "cancel");
    return cancelled;
  }

  if (game.escrowStatus !== "funded") {
    throw new GameError(`Cannot cancel a game with escrow ${game.escrowStatus}`);
  }

  if (chainVerificationEnabled()) {
    try {
      const txHash = await cancelGameOnChain(game.contractGameId);
      cancelled.payoutTxHash = txHash;
    } catch (err) {
      logger.error("On-chain cancel failed", { gameId, error: err });
      throw new UnavailableError(
        `Cancel transaction failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  gameRepo.updateGame(db, cancelled);
  broadcastGameUpdate(cancelled, "cancel");
  return cancelled;
}

// ============================================================================
// Play
// ============================================================================

export function makeMove(
  gameId: string,
  playerId: string,
  selfColumn: number,
  otherRow: number
): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, makeMoveState(game, playerId, selfColumn, otherRow), "move");
}

export function makeBet(gameId: string, playerId: string, amount: number): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, makeBetState(game, playerId, amount), "bet");
}

export function foldBet(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, foldBetState(game, playerId), "fold");
}

export function makeRevealMove(gameId: string, playerId: string, revealColumn: number): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, makeRevealMoveState(game, playerId, revealColumn), "reveal");
}

export function endRound(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, endRoundState(game, playerId), "endRound");
}

export function startNextRound(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  requireMember(game, playerId);
  return commit(db, startNextRoundState(game), "nextRound");
}

/**
 * Leave a game. In play: penalty and pot to the opponent, game ends. While
 * waiting: same as cancel (refund). Already ended: no-op.
 */
export async function leaveGame(gameId: string, playerId: string): Promise<GameState> {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  const role = requireMember(game, playerId);

  if (game.phase === "ended") {
    return game;
  }

  if (game.phase === "waiting") {
    return cancelGame(gameId, playerId);
  }

  const updated = leaveGameState(game, playerId);
  gameRepo.updateGame(db, updated);
  notifyPlayerLeft(updated, playerId);
  broadcastGameUpdate(updated, "leave");
  onGameEnded(db, updated, role);
  return updated;
}

/**
 * Forfeit a player who let the turn clock run out: treated as leaving.
 */
export function timeoutPlayer(gameId: string, playerId: string): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  const role = requireMember(game, playerId);

  if (game.phase === "ended" || game.phase === "waiting") {
    return game;
  }

  const updated = leaveGameState(game, playerId);
  gameRepo.updateGame(db, updated);
  notifyPlayerLeft(updated, playerId);
  broadcastGameUpdate(updated, "timeout");
  onGameEnded(db, updated, role);
  return updated;
}

/**
 * Abandon a game neither player is playing: pots return to their owners,
 * the game ends and settles by coins.
 */
export function abandonGame(gameId: string): GameState {
  const db = getDatabase();
  const game = loadGame(db, gameId);
  if (game.phase === "ended" || game.phase === "waiting") {
    return game;
  }
  return commit(db, abandonGameState(game), "timeout");
}

/**
 * Clear all games (useful for testing).
 */
export function clearAllGames(): void {
  const db = getDatabase();
  db.exec("DELETE FROM games");
  db.exec("DELETE FROM game_history");
}

/**
 * Get total number of games.
 */
export function getGameCount(): number {
  const db = getDatabase();
  const stmt = db.prepare("SELECT COUNT(*) as count FROM games");
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Record game end analytics (once per game).
 */
function recordGameEnd(db: Database, game: GameState, whoLeft?: "player1" | "player2"): void {
  if (historyRepo.getGameHistoryByGameId(db, game.gameId)) {
    return;
  }
  const startedAt = gameRepo.getGameStartedAt(db, game.gameId) ?? game.createdAt;
  const endedAt = Date.now();
  const analytics = calculateGameAnalytics(game, startedAt, endedAt, whoLeft);
  historyRepo.insertGameHistory(db, analytics);
}
