/**
 * Settlement worker
 *
 * When a game ends with its escrow active, the store hands the game id to
 * this worker. The worker computes the payout split from the final coins,
 * marks the escrow `settling`, submits `settleGame` through the transaction
 * queue, and records the result: `settled` with the tx hash and both
 * amounts, or `failed` with the error and a retry scheduled with backoff.
 * Subscribers get a `settlement` update after every status change.
 */

import type { Database } from "bun:sqlite";
import type { GameState } from "@civil-sarabande/shared";
import { computeSettlement, usdcToUnits } from "@civil-sarabande/shared";
import * as gameRepo from "../db/gameRepository";
import { getDatabase } from "../db/database";
import { broadcastGameUpdate } from "../websocket/gameNotifier";
import { settleGame as settleGameOnChain } from "./chainClient";
import { createLogger } from "../utils/logger";

const logger = createLogger("blockchain/settlement");

/** Backoff between retries: 1s, 5s, 30s, 2m, 10m. */
export const DEFAULT_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000];

export interface SettlementDeps {
  /** Submit settleGame and resolve with the tx hash once it is confirmed. */
  settleGame: (
    contractGameId: `0x${string}`,
    player1Amount: bigint,
    player2Amount: bigint
  ) => Promise<string>;
  /** Delay before retry n (0-based); the list length is the retry limit. */
  retryDelaysMs?: number[];
  /** Called after every escrow status change. */
  onUpdate?: (game: GameState) => void;
  getDb?: () => Database;
}

/**
 * Final coin totals used for settlement. Pots are normally empty by the time
 * a game ends (the engine resolves them), but if any coins remain in a pot
 * they still belong to whoever put them there.
 */
export function finalCoins(game: GameState): { player1Coins: number; player2Coins: number } {
  return {
    player1Coins: game.player1Coins + game.player1PotCoins,
    player2Coins: game.player2Coins + game.player2PotCoins,
  };
}

/** The payout split for an ended game, in USDC base units. */
export function settlementFor(game: GameState): { player1Amount: bigint; player2Amount: bigint } {
  const { player1Coins, player2Coins } = finalCoins(game);
  return computeSettlement(usdcToUnits(game.stake), player1Coins, player2Coins);
}

export class SettlementWorker {
  private readonly deps: Required<SettlementDeps>;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(deps: SettlementDeps) {
    this.deps = {
      settleGame: deps.settleGame,
      retryDelaysMs: deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
      onUpdate: deps.onUpdate ?? (() => {}),
      getDb: deps.getDb ?? getDatabase,
    };
  }

  /** Games currently being settled or waiting for a retry. */
  get pendingCount(): number {
    return this.inFlight.size + this.timers.size;
  }

  /**
   * Queue a game for settlement. Idempotent: a game already in flight or
   * waiting for a retry is not queued twice.
   */
  enqueue(gameId: string): void {
    if (this.stopped) return;
    if (this.inFlight.has(gameId) || this.timers.has(gameId)) return;
    this.run(gameId, 0);
  }

  /** Resolves once nothing is in flight (retry timers are not awaited). */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  /** Cancel pending retries (shutdown / tests). */
  stop(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private run(gameId: string, attempt: number): void {
    const promise = this.attempt(gameId, attempt)
      .catch((err) => {
        logger.error("Settlement attempt crashed", { gameId, attempt, error: err });
      })
      .finally(() => {
        this.inFlight.delete(gameId);
      });
    this.inFlight.set(gameId, promise);
  }

  private scheduleRetry(gameId: string, attempt: number): void {
    const delay = this.deps.retryDelaysMs[attempt];
    if (delay === undefined || this.stopped) {
      logger.error("Settlement gave up; manual action required", { gameId, attempts: attempt + 1 });
      return;
    }
    logger.warn("Scheduling settlement retry", { gameId, attempt: attempt + 1, delayMs: delay });
    const timer = setTimeout(() => {
      this.timers.delete(gameId);
      this.run(gameId, attempt + 1);
    }, delay);
    this.timers.set(gameId, timer);
  }

  private async attempt(gameId: string, attempt: number): Promise<void> {
    const db = this.deps.getDb();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      logger.warn("Settlement skipped: game not found", { gameId });
      return;
    }
    if (game.phase !== "ended") {
      logger.warn("Settlement skipped: game not ended", { gameId, phase: game.phase });
      return;
    }
    if (!["active", "settling", "failed"].includes(game.escrowStatus)) {
      logger.debug("Settlement skipped: escrow not settleable", {
        gameId,
        escrowStatus: game.escrowStatus,
      });
      return;
    }

    const { player1Amount, player2Amount } = settlementFor(game);
    const settling = gameRepo.updateEscrow(db, gameId, {
      escrowStatus: "settling",
      settlementError: null,
    });
    if (settling) this.deps.onUpdate(settling);

    logger.info("Settling game", {
      gameId,
      contractGameId: game.contractGameId,
      attempt,
      player1Amount: player1Amount.toString(),
      player2Amount: player2Amount.toString(),
    });

    try {
      const txHash = await this.deps.settleGame(game.contractGameId, player1Amount, player2Amount);
      const settled = gameRepo.updateEscrow(db, gameId, {
        escrowStatus: "settled",
        payoutTxHash: txHash,
        player1Payout: player1Amount.toString(),
        player2Payout: player2Amount.toString(),
        settlementError: null,
      });
      logger.info("Game settled", { gameId, txHash });
      if (settled) this.deps.onUpdate(settled);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Settlement failed", { gameId, attempt, error: err });
      const failed = gameRepo.updateEscrow(db, gameId, {
        escrowStatus: "failed",
        settlementError: message,
      });
      if (failed) this.deps.onUpdate(failed);
      this.scheduleRetry(gameId, attempt);
    }
  }
}

let worker: SettlementWorker | null = null;

/** The process-wide worker backed by the real chain client. */
export function getSettlementWorker(): SettlementWorker {
  if (!worker) {
    worker = new SettlementWorker({
      settleGame: settleGameOnChain,
      onUpdate: (game) => broadcastGameUpdate(game, "settlement"),
    });
  }
  return worker;
}

/** Replace the worker (tests). Pass null to restore the default. */
export function setSettlementWorker(replacement: SettlementWorker | null): void {
  worker = replacement;
}

/** Queue settlement for a game that has just ended. */
export function enqueueSettlement(gameId: string): void {
  getSettlementWorker().enqueue(gameId);
}

/** On boot: pick up every ended game whose escrow is still unsettled. */
export function reenqueuePendingSettlements(): number {
  const games = gameRepo.listGamesNeedingSettlement(getDatabase());
  for (const game of games) {
    logger.info("Re-enqueueing settlement from boot", {
      gameId: game.gameId,
      escrowStatus: game.escrowStatus,
    });
    enqueueSettlement(game.gameId);
  }
  return games.length;
}
