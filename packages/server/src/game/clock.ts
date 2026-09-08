/**
 * Game clock.
 *
 * The engine computes phase deadlines from these two settings. index.ts sets
 * the turn timeout from config at boot; tests override both to run the
 * timeout sweeper against a fake clock.
 */

const DEFAULT_TURN_TIMEOUT_MS = 120_000;

let turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS;
let nowFn: () => number = () => Date.now();

/** Milliseconds a player has to act; 0 disables the clock entirely. */
export function getTurnTimeoutMs(): number {
  return turnTimeoutMs;
}

export function setTurnTimeoutMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error("turn timeout must be a non-negative number of milliseconds");
  }
  turnTimeoutMs = ms;
}

/** Current time in epoch ms (overridable for tests). */
export function now(): number {
  return nowFn();
}

export function setClock(fn: (() => number) | null): void {
  nowFn = fn ?? (() => Date.now());
}

/**
 * Deadline for an action that must happen within one turn timeout from now,
 * or null when the clock is disabled.
 */
export function nextDeadline(): number | null {
  return turnTimeoutMs > 0 ? now() + turnTimeoutMs : null;
}
