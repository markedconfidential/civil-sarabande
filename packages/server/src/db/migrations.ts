/**
 * Database Migrations
 * 
 * Creates and updates the database schema.
 */

import type { Database } from "bun:sqlite";

/**
 * Run all migrations on the database.
 */
export function runMigrations(db: Database): void {
  // Create games table
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_id TEXT PRIMARY KEY,
      board TEXT NOT NULL,
      phase TEXT NOT NULL,
      player1_id TEXT NOT NULL,
      player1_name TEXT,
      player1_address TEXT,
      player2_id TEXT,
      player2_name TEXT,
      player2_address TEXT,
      player1_moves TEXT NOT NULL,
      player2_moves TEXT NOT NULL,
      player1_coins INTEGER NOT NULL,
      player2_coins INTEGER NOT NULL,
      player1_pot_coins INTEGER NOT NULL,
      player2_pot_coins INTEGER NOT NULL,
      player1_bet_made BOOLEAN NOT NULL,
      player2_bet_made BOOLEAN NOT NULL,
      settled_pot_coins INTEGER NOT NULL,
      player1_ended_round BOOLEAN NOT NULL,
      player2_ended_round BOOLEAN NOT NULL,
      round_number INTEGER NOT NULL,
      stake INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER
    )
  `);

  // Create game_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL UNIQUE,
      player1_id TEXT NOT NULL,
      player1_name TEXT,
      player2_id TEXT,
      player2_name TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      winner TEXT,
      loser TEXT,
      player1_starting_coins INTEGER NOT NULL,
      player2_starting_coins INTEGER NOT NULL,
      player1_ending_coins INTEGER,
      player2_ending_coins INTEGER,
      player1_net_change INTEGER,
      player2_net_change INTEGER,
      who_left TEXT,
      stake INTEGER NOT NULL,
      final_round_number INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_history_player1 ON game_history(player1_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_history_player2 ON game_history(player2_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_history_started_at ON game_history(started_at)
  `);
}

