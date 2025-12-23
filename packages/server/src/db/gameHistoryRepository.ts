/**
 * Game History Repository
 * 
 * Operations for recording completed games and analytics.
 */

import type { Database } from "bun:sqlite";

export interface GameHistoryRecord {
  id?: number;
  gameId: string;
  player1Id: string;
  player1Name?: string;
  player2Id?: string;
  player2Name?: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  winner: "player1" | "player2" | "tie" | null;
  loser: "player1" | "player2" | null;
  player1StartingCoins: number;
  player2StartingCoins: number;
  player1EndingCoins: number;
  player2EndingCoins: number;
  player1NetChange: number;
  player2NetChange: number;
  whoLeft: "player1" | "player2" | null;
  stake: number;
  finalRoundNumber: number;
  createdAt: number;
}

/**
 * Insert a game history record.
 */
export function insertGameHistory(
  db: Database,
  record: GameHistoryRecord
): void {
  const stmt = db.prepare(`
    INSERT INTO game_history (
      game_id, player1_id, player1_name, player2_id, player2_name,
      started_at, ended_at, duration_seconds, winner, loser,
      player1_starting_coins, player2_starting_coins,
      player1_ending_coins, player2_ending_coins,
      player1_net_change, player2_net_change,
      who_left, stake, final_round_number, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    record.gameId,
    record.player1Id,
    record.player1Name || null,
    record.player2Id || null,
    record.player2Name || null,
    record.startedAt,
    record.endedAt,
    record.durationSeconds,
    record.winner,
    record.loser,
    record.player1StartingCoins,
    record.player2StartingCoins,
    record.player1EndingCoins,
    record.player2EndingCoins,
    record.player1NetChange,
    record.player2NetChange,
    record.whoLeft,
    record.stake,
    record.finalRoundNumber,
    record.createdAt
  );
}

/**
 * Get game history by game ID.
 */
export function getGameHistoryByGameId(
  db: Database,
  gameId: string
): GameHistoryRecord | undefined {
  const stmt = db.prepare("SELECT * FROM game_history WHERE game_id = ?");
  const row = stmt.get(gameId) as Record<string, unknown> | undefined;
  
  if (!row) {
    return undefined;
  }
  
  return {
    id: row.id as number,
    gameId: row.game_id as string,
    player1Id: row.player1_id as string,
    player1Name: (row.player1_name as string) || undefined,
    player2Id: (row.player2_id as string) || undefined,
    player2Name: (row.player2_name as string) || undefined,
    startedAt: row.started_at as number,
    endedAt: row.ended_at as number,
    durationSeconds: row.duration_seconds as number,
    winner: row.winner as GameHistoryRecord["winner"],
    loser: row.loser as GameHistoryRecord["loser"],
    player1StartingCoins: row.player1_starting_coins as number,
    player2StartingCoins: row.player2_starting_coins as number,
    player1EndingCoins: row.player1_ending_coins as number,
    player2EndingCoins: row.player2_ending_coins as number,
    player1NetChange: row.player1_net_change as number,
    player2NetChange: row.player2_net_change as number,
    whoLeft: row.who_left as GameHistoryRecord["whoLeft"],
    stake: row.stake as number,
    finalRoundNumber: row.final_round_number as number,
    createdAt: row.created_at as number,
  };
}

