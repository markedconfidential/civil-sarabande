/**
 * Tests for database integration
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { getTestDatabase } from "../src/db/database";
import * as gameRepo from "../src/db/gameRepository";
import * as historyRepo from "../src/db/gameHistoryRepository";
import { calculateGameAnalytics } from "../src/db/analytics";
import { createGame, joinGame } from "../src/game/gameState";
import { GAME_CONSTANTS } from "@civil-sarabande/shared";

const { STARTING_COINS } = GAME_CONSTANTS;

describe("Database Integration", () => {
  let db: ReturnType<typeof getTestDatabase>;

  beforeEach(() => {
    db = getTestDatabase();
    // Clear tables before each test
    db.exec("DELETE FROM games");
    db.exec("DELETE FROM game_history");
  });

  test("can create and retrieve a game", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game = createGame(player1, 100);
    
    gameRepo.createGame(db, game);
    
    const retrieved = gameRepo.getGame(db, game.gameId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.gameId).toBe(game.gameId);
    expect(retrieved?.player1.id).toBe("p1");
  });

  test("can update a game", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game = createGame(player1, 100);
    
    gameRepo.createGame(db, game);
    
    const updated = { ...game, phase: "move1" as const };
    gameRepo.updateGame(db, updated);
    
    const retrieved = gameRepo.getGame(db, game.gameId);
    expect(retrieved?.phase).toBe("move1");
  });

  test("can list waiting games", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game1 = createGame(player1, 100);
    const game2 = createGame({ id: "p2", name: "Player 2" }, 200);
    
    gameRepo.createGame(db, game1);
    gameRepo.createGame(db, game2);
    
    const waiting = gameRepo.listWaitingGames(db);
    expect(waiting.length).toBe(2);
    expect(waiting.map(g => g.gameId)).toContain(game1.gameId);
    expect(waiting.map(g => g.gameId)).toContain(game2.gameId);
  });

  test("can record game history", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const player2 = { id: "p2", name: "Player 2" };
    const game = createGame(player1, 100);
    const joined = joinGame(game, player2);
    
    const startedAt = Date.now() - 60000; // 1 minute ago
    const endedAt = Date.now();
    
    const analytics = calculateGameAnalytics(joined, startedAt, endedAt);
    historyRepo.insertGameHistory(db, analytics);
    
    const history = historyRepo.getGameHistoryByGameId(db, game.gameId);
    expect(history).toBeDefined();
    expect(history?.gameId).toBe(game.gameId);
    expect(history?.player1Id).toBe("p1");
    expect(history?.player2Id).toBe("p2");
    expect(history?.durationSeconds).toBe(60);
    expect(history?.player1StartingCoins).toBe(STARTING_COINS);
    expect(history?.player2StartingCoins).toBe(STARTING_COINS);
  });

  test("can track started_at timestamp", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game = createGame(player1, 100);
    
    gameRepo.createGame(db, game);
    
    const startedAt = Date.now();
    gameRepo.setGameStartedAt(db, game.gameId, startedAt);
    
    const retrieved = gameRepo.getGameStartedAt(db, game.gameId);
    expect(retrieved).toBe(startedAt);
  });
});

