/**
 * Settlement worker: amounts, status transitions, retries, and the store
 * hook that enqueues ended games. Uses a fake chain client.
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";

process.env.AUTH_MODE = "dev";
process.env.SETTLEMENT_ENABLED = "true";
process.env.DATABASE_PATH = ":memory:";
process.env.CHAIN_ID = "31337";
process.env.RPC_URL = "http://127.0.0.1:1";
process.env.GAME_ESCROW_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";
process.env.USDC_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000002";
process.env.SERVER_WALLET_PRIVATE_KEY =
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

import type { GameState } from "@civil-sarabande/shared";
import { computeSettlement, usdcToUnits } from "@civil-sarabande/shared";
import { resetConfig } from "../src/config/env";
import { closeDatabase, getDatabase } from "../src/db/database";
import * as gameRepo from "../src/db/gameRepository";
import * as store from "../src/store/gameStore";
import { createGame, joinGame, makeMove, makeBet } from "../src/game/gameState";
import { setTurnTimeoutMs } from "../src/game/clock";
import {
  SettlementWorker,
  setSettlementWorker,
  getSettlementWorker,
  reenqueuePendingSettlements,
  settlementFor,
  finalCoins,
} from "../src/blockchain/settlement";

const P1 = { id: "alice", name: "Alice", address: "0x1111111111111111111111111111111111111111" };
const P2 = { id: "bob", name: "Bob", address: "0x2222222222222222222222222222222222222222" };

interface FakeChain {
  calls: Array<{ contractGameId: string; player1Amount: bigint; player2Amount: bigint }>;
  outcomes: Array<Error | string>;
  settle: (id: `0x${string}`, a: bigint, b: bigint) => Promise<string>;
}

function fakeChain(outcomes: Array<Error | string>): FakeChain {
  const chain: FakeChain = {
    calls: [],
    outcomes: [...outcomes],
    settle: async (contractGameId, player1Amount, player2Amount) => {
      chain.calls.push({ contractGameId, player1Amount, player2Amount });
      const next = chain.outcomes.shift() ?? "0xdefault";
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return chain;
}

function makeWorker(chain: FakeChain, delays: number[] = [1, 1, 1, 1, 1]) {
  const updates: GameState[] = [];
  const worker = new SettlementWorker({
    settleGame: chain.settle,
    retryDelaysMs: delays,
    onUpdate: (game) => updates.push(game),
    getDb: getDatabase,
  });
  return { worker, updates };
}

/** Insert an ended game with the given final coins and escrow status. */
function endedGame(p1Coins: number, p2Coins: number, escrowStatus: GameState["escrowStatus"] = "active") {
  const game: GameState = {
    ...joinGame(createGame(P1, 5, 1), P2),
    phase: "ended",
    phaseDeadline: null,
    player1Coins: p1Coins,
    player2Coins: p2Coins,
    player1PotCoins: 0,
    player2PotCoins: 0,
    escrowStatus,
  };
  gameRepo.createGame(getDatabase(), game);
  return game;
}

async function settleAndWait(worker: SettlementWorker, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await worker.whenIdle();
  while (worker.pendingCount > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await worker.whenIdle();
  }
}

beforeAll(() => {
  resetConfig();
  closeDatabase();
  getDatabase();
  setTurnTimeoutMs(0);
});

beforeEach(() => {
  store.clearAllGames();
  setSettlementWorker(null);
});

afterAll(() => {
  getSettlementWorker().stop();
  setSettlementWorker(null);
  setTurnTimeoutMs(120_000);
  closeDatabase();
});

describe("Settlement amounts", () => {
  test("split the escrow by final coins, pots included", () => {
    const game: GameState = {
      ...joinGame(createGame(P1, 5, 1), P2),
      player1Coins: 60,
      player1PotCoins: 10,
      player2Coins: 120,
      player2PotCoins: 10,
    };
    expect(finalCoins(game)).toEqual({ player1Coins: 70, player2Coins: 130 });
    const expected = computeSettlement(usdcToUnits(5), 70, 130);
    expect(settlementFor(game)).toEqual(expected);
    expect(expected.player1Amount + expected.player2Amount).toBe(10_000_000n);
    expect(expected.player1Amount).toBe(3_500_000n);
  });
});

describe("SettlementWorker", () => {
  test("settles a game: settling → settled with hash and payouts", async () => {
    const game = endedGame(200, 0);
    const chain = fakeChain(["0xsettled"]);
    const { worker, updates } = makeWorker(chain);

    worker.enqueue(game.gameId);
    await settleAndWait(worker);

    expect(chain.calls).toEqual([
      { contractGameId: game.contractGameId, player1Amount: 10_000_000n, player2Amount: 0n },
    ]);

    const settled = gameRepo.getGame(getDatabase(), game.gameId)!;
    expect(settled.escrowStatus).toBe("settled");
    expect(settled.payoutTxHash).toBe("0xsettled");
    expect(settled.player1Payout).toBe("10000000");
    expect(settled.player2Payout).toBe("0");
    expect(settled.settlementError).toBeNull();

    expect(updates.map((u) => u.escrowStatus)).toEqual(["settling", "settled"]);
    expect(worker.pendingCount).toBe(0);
  });

  test("marks failed with the error and retries with backoff until success", async () => {
    const game = endedGame(150, 50);
    const chain = fakeChain([new Error("nonce too low"), new Error("timeout"), "0xthird"]);
    const { worker, updates } = makeWorker(chain, [1, 1, 1, 1, 1]);

    worker.enqueue(game.gameId);
    await settleAndWait(worker);

    expect(chain.calls.length).toBe(3);
    for (const call of chain.calls) {
      expect(call.player1Amount).toBe(7_500_000n);
      expect(call.player2Amount).toBe(2_500_000n);
    }

    const statuses = updates.map((u) => u.escrowStatus);
    expect(statuses).toEqual(["settling", "failed", "settling", "failed", "settling", "settled"]);
    expect(updates[1].settlementError).toBe("nonce too low");
    expect(updates[3].settlementError).toBe("timeout");

    const settled = gameRepo.getGame(getDatabase(), game.gameId)!;
    expect(settled.escrowStatus).toBe("settled");
    expect(settled.payoutTxHash).toBe("0xthird");
    expect(settled.settlementError).toBeNull();
  });

  test("gives up after the retry budget and stays failed", async () => {
    const game = endedGame(100, 100);
    const chain = fakeChain([
      new Error("e1"),
      new Error("e2"),
      new Error("e3"),
      new Error("e4"),
      new Error("e5"),
      new Error("e6"),
      new Error("e7"),
    ]);
    const { worker } = makeWorker(chain, [1, 1, 1, 1, 1]);

    worker.enqueue(game.gameId);
    await settleAndWait(worker);

    // initial attempt + 5 retries
    expect(chain.calls.length).toBe(6);
    const failed = gameRepo.getGame(getDatabase(), game.gameId)!;
    expect(failed.escrowStatus).toBe("failed");
    expect(failed.settlementError).toBe("e6");
    expect(failed.payoutTxHash).toBeNull();
    expect(worker.pendingCount).toBe(0);
  });

  test("enqueue is idempotent while a game is in flight", async () => {
    const game = endedGame(120, 80);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const chain = fakeChain(["0xonce"]);
    const originalSettle = chain.settle;
    chain.settle = async (...args) => {
      await gate;
      return originalSettle(...args);
    };
    const { worker } = makeWorker(chain);

    worker.enqueue(game.gameId);
    worker.enqueue(game.gameId);
    worker.enqueue(game.gameId);
    release();
    await settleAndWait(worker);

    expect(chain.calls.length).toBe(1);
  });

  test("skips games that are not ended or whose escrow is not settleable", async () => {
    const notEnded: GameState = { ...endedGame(100, 100), phase: "move1" };
    gameRepo.updateGame(getDatabase(), notEnded);
    const unfunded = endedGame(100, 100, "unfunded");
    const settled = endedGame(100, 100, "settled");
    const chain = fakeChain(["0xno"]);
    const { worker, updates } = makeWorker(chain);

    worker.enqueue(notEnded.gameId);
    worker.enqueue(unfunded.gameId);
    worker.enqueue(settled.gameId);
    worker.enqueue("does-not-exist");
    await settleAndWait(worker);

    expect(chain.calls).toEqual([]);
    expect(updates).toEqual([]);
  });

  test("re-enqueues active, settling and failed ended games on boot", async () => {
    const active = endedGame(200, 0, "active");
    const settling = endedGame(0, 200, "settling");
    const failed = endedGame(100, 100, "failed");
    endedGame(100, 100, "settled");
    endedGame(100, 100, "cancelled");
    const chain = fakeChain(["0xa", "0xb", "0xc"]);
    const { worker } = makeWorker(chain);
    setSettlementWorker(worker);

    expect(reenqueuePendingSettlements()).toBe(3);
    await settleAndWait(worker);

    expect(new Set(chain.calls.map((c) => c.contractGameId))).toEqual(
      new Set([active.contractGameId, settling.contractGameId, failed.contractGameId])
    );
    for (const id of [active.gameId, settling.gameId, failed.gameId]) {
      expect(gameRepo.getGame(getDatabase(), id)?.escrowStatus).toBe("settled");
    }
  });
});

describe("Store hook", () => {
  test("a leave that ends an active-escrow game is settled by resulting coins", async () => {
    const chain = fakeChain(["0xleave"]);
    const { worker } = makeWorker(chain);
    setSettlementWorker(worker);

    let game: GameState = { ...joinGame(createGame(P1, 5, 1), P2), escrowStatus: "active" };
    game = makeMove(game, P1.id, 0, 0);
    game = makeMove(game, P2.id, 0, 0);
    game = makeBet(game, P1.id, 20);
    gameRepo.createGame(getDatabase(), game);

    // Bob leaves: forfeits his 1-coin pot, pays the 6-coin penalty.
    // Alice: 79 + (21 + 1) + 6 = 107; Bob: 99 - 6 = 93.
    const ended = await store.leaveGame(game.gameId, P2.id);
    expect(ended.phase).toBe("ended");
    expect(ended.player1Coins).toBe(107);
    expect(ended.player2Coins).toBe(93);

    await settleAndWait(worker);
    const expected = computeSettlement(usdcToUnits(5), 107, 93);
    expect(chain.calls).toEqual([
      {
        contractGameId: game.contractGameId,
        player1Amount: expected.player1Amount,
        player2Amount: expected.player2Amount,
      },
    ]);
    expect(store.getGame(game.gameId)?.escrowStatus).toBe("settled");
    expect(store.getGame(game.gameId)?.player1Payout).toBe(expected.player1Amount.toString());
  });

  test("leaving an ended game does not re-settle or re-record history", async () => {
    const chain = fakeChain(["0xonce", "0xtwice"]);
    const { worker } = makeWorker(chain);
    setSettlementWorker(worker);

    const game: GameState = { ...joinGame(createGame(P1, 5, 1), P2), escrowStatus: "active" };
    gameRepo.createGame(getDatabase(), game);

    await store.leaveGame(game.gameId, P1.id);
    await settleAndWait(worker);
    const again = await store.leaveGame(game.gameId, P2.id);
    await settleAndWait(worker);

    expect(again.phase).toBe("ended");
    expect(chain.calls.length).toBe(1);
  });
});
