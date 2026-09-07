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

  test("lists only funded waiting games created within the last hour", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const funded = { ...createGame(player1, 100), escrowStatus: "funded" as const };
    const unfunded = createGame({ id: "p2", name: "Player 2" }, 200);
    const stale = {
      ...createGame({ id: "p3", name: "Player 3" }, 300),
      escrowStatus: "funded" as const,
      createdAt: Date.now() - 2 * 60 * 60 * 1000,
    };
    const joined = {
      ...createGame({ id: "p4", name: "Player 4" }, 400),
      escrowStatus: "active" as const,
      phase: "move1" as const,
    };

    for (const game of [funded, unfunded, stale, joined]) {
      gameRepo.createGame(db, game);
    }

    const waiting = gameRepo.listWaitingGames(db);
    expect(waiting.map((g) => g.gameId)).toEqual([funded.gameId]);
  });

  test("round-trips escrow, clock and round-result fields", () => {
    const game = createGame({ id: "p1", name: "Player 1" }, 1.5);
    gameRepo.createGame(db, game);

    const updated = {
      ...game,
      escrowStatus: "settled" as const,
      payoutTxHash: "0xhash",
      player1Payout: "3000000",
      player2Payout: "0",
      settlementError: null,
      phaseDeadline: 1234567890,
      roundResult: {
        roundNumber: 1,
        player1Score: 50,
        player2Score: 40,
        winner: "player1" as const,
        potWon: 10,
        byFold: false,
      },
    };
    gameRepo.updateGame(db, updated);

    const retrieved = gameRepo.getGame(db, game.gameId)!;
    expect(retrieved.stake).toBe(1.5);
    expect(retrieved.contractGameId).toBe(game.contractGameId);
    expect(retrieved.escrowStatus).toBe("settled");
    expect(retrieved.payoutTxHash).toBe("0xhash");
    expect(retrieved.player1Payout).toBe("3000000");
    expect(retrieved.player2Payout).toBe("0");
    expect(retrieved.phaseDeadline).toBe(1234567890);
    expect(retrieved.roundResult).toEqual(updated.roundResult);
  });

  test("updateEscrow changes only escrow fields", () => {
    const game = createGame({ id: "p1", name: "Player 1" }, 2);
    gameRepo.createGame(db, game);

    const result = gameRepo.updateEscrow(db, game.gameId, {
      escrowStatus: "failed",
      settlementError: "boom",
    })!;
    expect(result.escrowStatus).toBe("failed");
    expect(result.settlementError).toBe("boom");
    expect(result.phase).toBe("waiting");
    expect(result.player1Coins).toBe(STARTING_COINS);
  });

  test("findGameByPlayer returns the newest unfinished game", () => {
    const older = { ...createGame({ id: "p1", name: "Player 1" }, 1), createdAt: 1000 };
    const newer = { ...createGame({ id: "p1", name: "Player 1" }, 1), createdAt: 2000 };
    const ended = {
      ...createGame({ id: "p1", name: "Player 1" }, 1),
      createdAt: 3000,
      phase: "ended" as const,
    };
    for (const game of [older, newer, ended]) gameRepo.createGame(db, game);

    expect(gameRepo.findGameByPlayer(db, "p1")?.gameId).toBe(newer.gameId);
    expect(gameRepo.findGameByPlayer(db, "nobody")).toBeUndefined();
  });

  test("listExpiredGames and listGamesNeedingSettlement", () => {
    const expired = {
      ...createGame({ id: "p1", name: "Player 1" }, 1),
      phase: "move1" as const,
      phaseDeadline: 500,
    };
    const live = {
      ...createGame({ id: "p2", name: "Player 2" }, 1),
      phase: "move1" as const,
      phaseDeadline: 5000,
    };
    const unsettled = {
      ...createGame({ id: "p3", name: "Player 3" }, 1),
      phase: "ended" as const,
      escrowStatus: "failed" as const,
    };
    for (const game of [expired, live, unsettled]) gameRepo.createGame(db, game);

    expect(gameRepo.listExpiredGames(db, 1000).map((g) => g.gameId)).toEqual([expired.gameId]);
    expect(gameRepo.listGamesNeedingSettlement(db).map((g) => g.gameId)).toEqual([unsettled.gameId]);
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

  test("can store payout transaction hash", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game = createGame(player1, 100);

    gameRepo.createGame(db, game);

    const txHash = "0xabc123";
    gameRepo.setPayoutTxHash(db, game.gameId, txHash);

    const retrieved = gameRepo.getPayoutTxHash(db, game.gameId);
    expect(retrieved).toBe(txHash);
  });
});
