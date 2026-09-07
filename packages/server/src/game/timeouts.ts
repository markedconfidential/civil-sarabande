/**
 * Turn timeout sweeper
 *
 * Every 5 seconds, finds games whose phaseDeadline has passed and forfeits
 * whoever failed to act:
 *
 * - one idle player  → treated as that player leaving (penalty, pot to the
 *                      opponent), broadcast with action "timeout"
 * - both idle        → the game is abandoned: pots return to their owners,
 *                      phase ended, settlement by coins
 *
 * The clock is disabled when the turn timeout is 0 (no deadlines are set,
 * so the sweeper finds nothing).
 */

import { getDatabase } from "../db/database";
import * as gameRepo from "../db/gameRepository";
import * as store from "../store/gameStore";
import { getPendingPlayers } from "./gameState";
import { now as clockNow } from "./clock";
import { createLogger } from "../utils/logger";

const logger = createLogger("game/timeouts");

export const SWEEP_INTERVAL_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Forfeit every game whose deadline is at or before `now`.
 * Returns the ids of the games that were ended.
 */
export function sweepTimeouts(now: number = clockNow()): string[] {
  const db = getDatabase();
  const expired = gameRepo.listExpiredGames(db, now);
  const ended: string[] = [];

  for (const game of expired) {
    try {
      const pending = getPendingPlayers(game);
      if (pending.length === 0) {
        // Nothing to wait for; drop the stale deadline.
        gameRepo.updateGame(db, { ...game, phaseDeadline: null });
        continue;
      }

      if (pending.length === 1) {
        const idle = pending[0] === "player1" ? game.player1 : game.player2;
        if (!idle) continue;
        logger.info("Turn timeout: forfeiting idle player", {
          gameId: game.gameId,
          playerId: idle.id,
          phase: game.phase,
        });
        store.timeoutPlayer(game.gameId, idle.id);
      } else {
        logger.info("Turn timeout: both players idle, abandoning game", {
          gameId: game.gameId,
          phase: game.phase,
        });
        store.abandonGame(game.gameId);
      }
      ended.push(game.gameId);
    } catch (err) {
      logger.error("Timeout sweep failed for game", { gameId: game.gameId, error: err });
    }
  }

  return ended;
}

export function startTimeoutSweeper(intervalMs: number = SWEEP_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      sweepTimeouts();
    } catch (err) {
      logger.error("Timeout sweep crashed", { error: err });
    }
  }, intervalMs);
  logger.info("Turn timeout sweeper started", { intervalMs });
}

export function stopTimeoutSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
