/**
 * Game Repository
 * 
 * CRUD operations for active games in the database.
 */

import type { Database } from "bun:sqlite";
import type { GameState, Player } from "@civil-sarabande/shared";

/**
 * Convert GameState to database row format.
 */
function gameStateToRow(game: GameState, startedAt?: number): Record<string, unknown> {
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

  return {
    gameId: row.game_id as string,
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
  };
}

/**
 * Create a new game in the database.
 */
export function createGame(
  db: Database,
  game: GameState
): void {
  const row = gameStateToRow(game);
  const stmt = db.prepare(`
    INSERT INTO games (
      game_id, board, phase, player1_id, player1_name, player1_address,
      player2_id, player2_name, player2_address, player1_moves, player2_moves,
      player1_coins, player2_coins, player1_pot_coins, player2_pot_coins,
      player1_bet_made, player2_bet_made, settled_pot_coins,
      player1_ended_round, player2_ended_round, round_number, stake,
      created_at, updated_at, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    row.game_id as string,
    row.board as string,
    row.phase as string,
    row.player1_id as string,
    row.player1_name as string | null,
    row.player1_address as string | null,
    row.player2_id as string | null,
    row.player2_name as string | null,
    row.player2_address as string | null,
    row.player1_moves as string,
    row.player2_moves as string,
    row.player1_coins as number,
    row.player2_coins as number,
    row.player1_pot_coins as number,
    row.player2_pot_coins as number,
    row.player1_bet_made as number,
    row.player2_bet_made as number,
    row.settled_pot_coins as number,
    row.player1_ended_round as number,
    row.player2_ended_round as number,
    row.round_number as number,
    row.stake as number,
    row.created_at as number,
    row.updated_at as number,
    row.started_at as number | null
  );
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
 * Update a game in the database.
 */
export function updateGame(
  db: Database,
  game: GameState,
  startedAt?: number
): void {
  const row = gameStateToRow(game, startedAt);
  const stmt = db.prepare(`
    UPDATE games SET
      board = ?,
      phase = ?,
      player1_id = ?,
      player1_name = ?,
      player1_address = ?,
      player2_id = ?,
      player2_name = ?,
      player2_address = ?,
      player1_moves = ?,
      player2_moves = ?,
      player1_coins = ?,
      player2_coins = ?,
      player1_pot_coins = ?,
      player2_pot_coins = ?,
      player1_bet_made = ?,
      player2_bet_made = ?,
      settled_pot_coins = ?,
      player1_ended_round = ?,
      player2_ended_round = ?,
      round_number = ?,
      stake = ?,
      updated_at = ?,
      started_at = COALESCE(?, started_at)
    WHERE game_id = ?
  `);
  
  stmt.run(
    row.board as string,
    row.phase as string,
    row.player1_id as string,
    row.player1_name as string | null,
    row.player1_address as string | null,
    row.player2_id as string | null,
    row.player2_name as string | null,
    row.player2_address as string | null,
    row.player1_moves as string,
    row.player2_moves as string,
    row.player1_coins as number,
    row.player2_coins as number,
    row.player1_pot_coins as number,
    row.player2_pot_coins as number,
    row.player1_bet_made as number,
    row.player2_bet_made as number,
    row.settled_pot_coins as number,
    row.player1_ended_round as number,
    row.player2_ended_round as number,
    row.round_number as number,
    row.stake as number,
    row.updated_at as number,
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
 * List all games in "waiting" phase.
 */
export function listWaitingGames(db: Database): GameState[] {
  const stmt = db.prepare("SELECT * FROM games WHERE phase = 'waiting'");
  const rows = stmt.all() as Record<string, unknown>[];
  
  return rows.map(rowToGameState);
}

/**
 * Find a game that a player is currently in.
 */
export function findGameByPlayer(db: Database, playerId: string): GameState | undefined {
  const stmt = db.prepare(`
    SELECT * FROM games 
    WHERE player1_id = ? OR player2_id = ?
    LIMIT 1
  `);
  const row = stmt.get(playerId, playerId) as Record<string, unknown> | undefined;
  
  if (!row) {
    return undefined;
  }
  
  return rowToGameState(row);
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

