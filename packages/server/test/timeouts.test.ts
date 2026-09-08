/**
 * Turn timeouts: deadlines on the state, and the sweeper's forfeits.
 * Runs the store against an in-memory database in engine-only mode.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";

process.env.AUTH_MODE = "dev";
process.env.SETTLEMENT_ENABLED = "false";
process.env.DATABASE_PATH = ":memory:";
process.env.TURN_TIMEOUT_SECONDS = "1";

import { resetConfig } from "../src/config/env";
import { closeDatabase, getDatabase } from "../src/db/database";
import * as store from "../src/store/gameStore";
import * as historyRepo from "../src/db/gameHistoryRepository";
import { setClock, setTurnTimeoutMs } from "../src/game/clock";
import {
  sweepTimeouts,
  startTimeoutSweeper,
  stopTimeoutSweeper,
} from "../src/game/timeouts";

const P1 = { id: "alice", name: "Alice" };
const P2 = { id: "bob", name: "Bob" };

let fakeNow = 1_000_000;

async function activeGame() {
  const created = store.createGame(P1, 5);
  await store.confirmFunding(created.gameId, P1.id);
  return store.joinGame(created.gameId, P2);
}

beforeAll(() => {
  resetConfig();
  closeDatabase();
  getDatabase();
  setClock(() => fakeNow);
  setTurnTimeoutMs(1_000);
});

beforeEach(() => {
  fakeNow = 1_000_000;
  store.clearAllGames();
});

afterAll(() => {
  stopTimeoutSweeper();
  setClock(null);
  setTurnTimeoutMs(120_000);
  closeDatabase();
});

describe("Phase deadlines", () => {
  test("waiting games have no deadline; joining starts the clock", async () => {
    const created = store.createGame(P1, 5);
    expect(created.phaseDeadline).toBeNull();

    const game = await activeGame();
    expect(game.phase).toBe("move1");
    expect(game.phaseDeadline).toBe(fakeNow + 1_000);
  });

  test("every action restarts the clock", async () => {
    const game = await activeGame();
    fakeNow += 400;
    const moved = store.makeMove(game.gameId, P1.id, 0, 0);
    expect(moved.phaseDeadline).toBe(fakeNow + 1_000);

    fakeNow += 400;
    const both = store.makeMove(game.gameId, P2.id, 0, 0);
    expect(both.phase).toBe("bet1");
    expect(both.phaseDeadline).toBe(fakeNow + 1_000);
  });

  test("an ended game has no deadline", async () => {
    const game = await activeGame();
    const ended = await store.leaveGame(game.gameId, P2.id);
    expect(ended.phase).toBe("ended");
    expect(ended.phaseDeadline).toBeNull();
  });

  test("TURN_TIMEOUT_SECONDS=0 disables the clock", async () => {
    setTurnTimeoutMs(0);
    try {
      const game = await activeGame();
      expect(game.phaseDeadline).toBeNull();
      const moved = store.makeMove(game.gameId, P1.id, 0, 0);
      expect(moved.phaseDeadline).toBeNull();
      fakeNow += 10_000;
      expect(sweepTimeouts()).toEqual([]);
      expect(store.getGame(game.gameId)?.phase).toBe("move1");
    } finally {
      setTurnTimeoutMs(1_000);
    }
  });
});

describe("Sweeper", () => {
  test("does nothing before the deadline", async () => {
    const game = await activeGame();
    fakeNow += 999;
    expect(sweepTimeouts()).toEqual([]);
    expect(store.getGame(game.gameId)?.phase).toBe("move1");
  });

  test("forfeits the one idle player as a leave", async () => {
    const game = await activeGame();
    store.makeMove(game.gameId, P1.id, 0, 0);
    fakeNow += 1_000;

    expect(sweepTimeouts()).toEqual([game.gameId]);

    const ended = store.getGame(game.gameId)!;
    expect(ended.phase).toBe("ended");
    expect(ended.phaseDeadline).toBeNull();
    // Bob (idle) pays the round-1 leave penalty of 6 and forfeits the 2-coin pot.
    expect(ended.player2Coins).toBe(99 - 6);
    expect(ended.player1Coins).toBe(99 + 2 + 6);

    const history = historyRepo.getGameHistoryByGameId(getDatabase(), game.gameId);
    expect(history?.whoLeft).toBe("player2");
    expect(history?.winner).toBe("player1");
  });

  test("abandons the game when both players are idle", async () => {
    const game = await activeGame();
    store.makeMove(game.gameId, P1.id, 0, 0);
    store.makeMove(game.gameId, P2.id, 0, 0);
    store.makeBet(game.gameId, P1.id, 7);
    store.makeBet(game.gameId, P2.id, 10); // raise; p1 must respond
    // Both act again in bet1? No: only p1 is pending. Move to a phase where
    // both are: call, then nobody moves in move2.
    store.makeBet(game.gameId, P1.id, 3);
    expect(store.getGame(game.gameId)?.phase).toBe("move2");

    fakeNow += 1_000;
    expect(sweepTimeouts()).toEqual([game.gameId]);

    const ended = store.getGame(game.gameId)!;
    expect(ended.phase).toBe("ended");
    // Pots (1 + 10 each) go back to their owners: no penalty either way.
    expect(ended.player1Coins).toBe(100);
    expect(ended.player2Coins).toBe(100);
    expect(ended.player1PotCoins).toBe(0);
    expect(ended.player2PotCoins).toBe(0);

    const history = historyRepo.getGameHistoryByGameId(getDatabase(), game.gameId);
    expect(history?.whoLeft).toBeNull();
    expect(history?.winner).toBe("tie");
  });

  test("a sweep is idempotent and leaves ended games alone", async () => {
    const game = await activeGame();
    fakeNow += 1_000;
    expect(sweepTimeouts()).toEqual([game.gameId]);
    fakeNow += 1_000;
    expect(sweepTimeouts()).toEqual([]);
  });

  test("the interval sweeper forfeits on its own", async () => {
    const game = await activeGame();
    store.makeMove(game.gameId, P2.id, 0, 0);
    fakeNow += 1_000;

    startTimeoutSweeper(5);
    try {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline && store.getGame(game.gameId)?.phase !== "ended") {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      stopTimeoutSweeper();
    }

    const ended = store.getGame(game.gameId)!;
    expect(ended.phase).toBe("ended");
    expect(ended.player1Coins).toBe(99 - 6); // Alice was the idle one
  });
});
