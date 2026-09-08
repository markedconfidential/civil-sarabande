/**
 * Game Repository
 *
 * CRUD operations for games in the database. The full GameState, including
 * escrow, settlement, clock and round-result fields, round-trips through
 * the `games` table.
 */

import type { Database } from "bun:sqlite";
import type { EscrowStatus, GameState, Player, RoundResult } from "@civil-sarabande/shared";
import { contractGameIdFor } from "../blockchain/gameId";

/** How long a funded, unjoined game stays listed. */
export const WAITING_GAME_MAX_AGE_MS = 60 * 60 * 1000;

const COLUMNS = [
  "game_id",
  "board",
  "phase",
  "player1_id",
  "player1_name",
  "player1_address",
  "player2_id",
  "player2_name",
  "player2_address",
  "player1_moves",
  "player2_moves",
  "player1_coins",
  "player2_coins",
  "player1_pot_coins",
  "player2_pot_coins",
  "player1_bet_made",
  "player2_bet_made",
  "settled_pot_coins",
  "player1_ended_round",
  "player2_ended_round",
  "round_number",
  "stake",
  "created_at",
  "updated_at",
  "started_at",
  "contract_game_id",
  "escrow_status",
  "payout_tx_hash",
  "player1_payout",
  "player2_payout",
  "settlement_error",
  "phase_deadline",
  "round_result",
] as const;

type Row = Record<(typeof COLUMNS)[number], unknown>;

/**
 * Convert GameState to database row format.
 */
function gameStateToRow(game: GameState, startedAt?: number): Row {
  return {
    game_id: game.gameId,
    board: JSON.stringify(game.board),
    phase: game.phase,
    player1_id: game.player1.id,
    player1_name: game.player1.name || null,
    player1_address: game.player1.address || null,
    player2_id: game.player2?.id || null,
    player2_name: game.player2?.name || null,
    player2_address: game.player2?.address || null,
    player1_moves: JSON.stringify(game.player1Moves),
    player2_moves: JSON.stringify(game.player2Moves),
    player1_coins: game.player1Coins,
    player2_coins: game.player2Coins,
    player1_pot_coins: game.player1PotCoins,
    player2_pot_coins: game.player2PotCoins,
    player1_bet_made: game.player1BetMade ? 1 : 0,
    player2_bet_made: game.player2BetMade ? 1 : 0,
    settled_pot_coins: game.settledPotCoins,
    player1_ended_round: game.player1EndedRound ? 1 : 0,
    player2_ended_round: game.player2EndedRound ? 1 : 0,
    round_number: game.roundNumber,
    stake: game.stake,
    created_at: game.createdAt,
    updated_at: Date.now(),
    started_at: startedAt || null,
    contract_game_id: game.contractGameId,
    escrow_status: game.escrowStatus,
    payout_tx_hash: game.payoutTxHash,
    player1_payout: game.player1Payout,
    player2_payout: game.player2Payout,
    settlement_error: game.settlementError,
    phase_deadline: game.phaseDeadline,
    round_result: game.roundResult ? JSON.stringify(game.roundResult) : null,
  };
}

/**
 * Convert database row to GameState.
 */
function rowToGameState(row: Record<string, unknown>): GameState {
  const player1: Player = {
    id: row.player1_id as string,
    name: (row.player1_name as string) || undefined,
    address: (row.player1_address as string) || undefined,
  };

  const player2: Player | null = row.player2_id
    ? {
        id: row.player2_id as string,
        name: (row.player2_name as string) || undefined,
        address: (row.player2_address as string) || undefined,
      }
    : null;

  const gameId = row.game_id as string;

  return {
    gameId,
    board: JSON.parse(row.board as string),
    phase: row.phase as GameState["phase"],
    player1,
    player2,
    player1Moves: JSON.parse(row.player1_moves as string),
    player2Moves: JSON.parse(row.player2_moves as string),
    player1Coins: row.player1_coins as number,
    player2Coins: row.player2_coins as number,
    player1PotCoins: row.player1_pot_coins as number,
    player2PotCoins: row.player2_pot_coins as number,
    player1BetMade: (row.player1_bet_made as number) === 1,
    player2BetMade: (row.player2_bet_made as number) === 1,
    settledPotCoins: row.settled_pot_coins as number,
    player1EndedRound: (row.player1_ended_round as number) === 1,
    player2EndedRound: (row.player2_ended_round as number) === 1,
    roundNumber: row.round_number as number,
    stake: row.stake as number,
    createdAt: row.created_at as number,

    escrowStatus: ((row.escrow_status as string) || "unfunded") as EscrowStatus,
    contractGameId: ((row.contract_game_id as string) || contractGameIdFor(gameId)) as `0x${string}`,
    payoutTxHash: (row.payout_tx_hash as string) || null,
    player1Payout: (row.player1_payout as string) ?? null,
    player2Payout: (row.player2_payout as string) ?? null,
    settlementError: (row.settlement_error as string) || null,

    phaseDeadline: (row.phase_deadline as number) ?? null,
    roundResult: row.round_result ? (JSON.parse(row.round_result as string) as RoundResult) : null,
  };
}

function rowValues(row: Row): unknown[] {
  return COLUMNS.map((column) => row[column]);
}

/**
 * Create a new game in the database.
 */
export function createGame(db: Database, game: GameState): void {
  const row = gameStateToRow(game);
  const placeholders = COLUMNS.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT INTO games (${COLUMNS.join(", ")}) VALUES (${placeholders})`);
  stmt.run(...(rowValues(row) as (string | number | null)[]));
}

/**
 * Get a game by ID.
 */
export function getGame(db: Database, gameId: string): GameState | undefined {
  const stmt = db.prepare("SELECT * FROM games WHERE game_id = ?");
  const row = stmt.get(gameId) as Record<string, unknown> | undefined;

  if (!row) {
    return undefined;
  }

  return rowToGameState(row);
}

/**
 * Update a game in the database. `started_at` is only written when given.
 */
export function updateGame(db: Database, game: GameState, startedAt?: number): void {
  const row = gameStateToRow(game, startedAt);
  const assignable = COLUMNS.filter((column) => column !== "game_id" && column !== "started_at");
  const assignments = assignable.map((column) => `${column} = ?`).join(",\n      ");
  const stmt = db.prepare(`
    UPDATE games SET
      ${assignments},
      started_at = COALESCE(?, started_at)
    WHERE game_id = ?
  `);

  stmt.run(
    ...(assignable.map((column) => row[column]) as (string | number | null)[]),
    row.started_at as number | null,
    row.game_id as string
  );
}

/**
 * Delete a game from the database.
 */
export function deleteGame(db: Database, gameId: string): boolean {
  const stmt = db.prepare("DELETE FROM games WHERE game_id = ?");
  const result = stmt.run(gameId);
  return result.changes > 0;
}

/**
 * List joinable games: waiting, funded, and created within the last hour.
 */
export function listWaitingGames(db: Database, now: number = Date.now()): GameState[] {
  const stmt = db.prepare(`
    SELECT * FROM games
    WHERE phase = 'waiting' AND escrow_status = 'funded' AND created_at > ?
    ORDER BY created_at DESC
  `);
  const rows = stmt.all(now - WAITING_GAME_MAX_AGE_MS) as Record<string, unknown>[];

  return rows.map(rowToGameState);
}

/**
 * Find the most recent game a player is in that has not ended.
 */
export function findGameByPlayer(db: Database, playerId: string): GameState | undefined {
  const stmt = db.prepare(`
    SELECT * FROM games
    WHERE (player1_id = ? OR player2_id = ?) AND phase != 'ended'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = stmt.get(playerId, playerId) as Record<string, unknown> | undefined;

  if (!row) {
    return undefined;
  }

  return rowToGameState(row);
}

/**
 * Games whose turn clock has run out (deadline in the past, still in play).
 */
export function listExpiredGames(db: Database, now: number): GameState[] {
  const stmt = db.prepare(`
    SELECT * FROM games
    WHERE phase_deadline IS NOT NULL AND phase_deadline <= ?
      AND phase != 'waiting' AND phase != 'ended'
  `);
  const rows = stmt.all(now) as Record<string, unknown>[];
  return rows.map(rowToGameState);
}

/**
 * Ended games whose escrow still needs settling (for re-enqueue on boot).
 */
export function listGamesNeedingSettlement(db: Database): GameState[] {
  const stmt = db.prepare(`
    SELECT * FROM games
    WHERE phase = 'ended' AND escrow_status IN ('active', 'settling', 'failed')
    ORDER BY updated_at ASC
  `);
  const rows = stmt.all() as Record<string, unknown>[];
  return rows.map(rowToGameState);
}

/**
 * Get the started_at timestamp for a game.
 */
export function getGameStartedAt(db: Database, gameId: string): number | null {
  const stmt = db.prepare("SELECT started_at FROM games WHERE game_id = ?");
  const row = stmt.get(gameId) as { started_at: number | null } | undefined;
  return row?.started_at ?? null;
}

/**
 * Set the started_at timestamp for a game.
 */
export function setGameStartedAt(db: Database, gameId: string, startedAt: number): void {
  const stmt = db.prepare("UPDATE games SET started_at = ? WHERE game_id = ?");
  stmt.run(startedAt, gameId);
}

/**
 * Get the payout transaction hash for a game.
 */
export function getPayoutTxHash(db: Database, gameId: string): string | null {
  const stmt = db.prepare("SELECT payout_tx_hash FROM games WHERE game_id = ?");
  const row = stmt.get(gameId) as { payout_tx_hash: string | null } | undefined;
  return row?.payout_tx_hash ?? null;
}

/**
 * Set the payout transaction hash for a game.
 */
export function setPayoutTxHash(db: Database, gameId: string, txHash: string): void {
  const stmt = db.prepare(`
    UPDATE games
    SET payout_tx_hash = ?, updated_at = ?
    WHERE game_id = ?
  `);
  stmt.run(txHash, Date.now(), gameId);
}

/** Escrow-related fields that the settlement worker updates. */
export interface EscrowUpdate {
  escrowStatus: EscrowStatus;
  payoutTxHash?: string | null;
  player1Payout?: string | null;
  player2Payout?: string | null;
  settlementError?: string | null;
}

/**
 * Update only the escrow fields of a game, leaving play state untouched.
 * Returns the updated game, or undefined if it no longer exists.
 */
export function updateEscrow(db: Database, gameId: string, update: EscrowUpdate): GameState | undefined {
  const sets: string[] = ["escrow_status = ?", "updated_at = ?"];
  const values: (string | number | null)[] = [update.escrowStatus, Date.now()];
  if (update.payoutTxHash !== undefined) {
    sets.push("payout_tx_hash = ?");
    values.push(update.payoutTxHash);
  }
  if (update.player1Payout !== undefined) {
    sets.push("player1_payout = ?");
    values.push(update.player1Payout);
  }
  if (update.player2Payout !== undefined) {
    sets.push("player2_payout = ?");
    values.push(update.player2Payout);
  }
  if (update.settlementError !== undefined) {
    sets.push("settlement_error = ?");
    values.push(update.settlementError);
  }
  values.push(gameId);
  db.prepare(`UPDATE games SET ${sets.join(", ")} WHERE game_id = ?`).run(...values);
  return getGame(db, gameId);
}
