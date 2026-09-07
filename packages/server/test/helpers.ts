/**
 * Shared helpers for engine-level tests: deterministic games on the
 * seed-12345 board with known scores (see scoring.test.ts).
 */

import type { GameState } from "@civil-sarabande/shared";
import {
  createGame,
  joinGame,
  makeMove,
  makeBet,
  makeRevealMove,
} from "../src/game/gameState";

export const P1 = { id: "p1", name: "Alice" };
export const P2 = { id: "p2", name: "Bob" };

/** A joined game in move1 on the seed-12345 board. */
export function activeGame(seed = 12345, stake = 5): GameState {
  return joinGame(createGame(P1, stake, seed), P2);
}

/**
 * Moves that score 70 (p1) vs 54 (p2) on the seed-12345 board when both
 * players send them; see scoring.test.ts for the arithmetic.
 */
export const P1_WINS_MOVES = [0, 3, 1, 4, 2, 5];

/** Moves that score 66 vs 66 on the seed-12345 board. */
export const TIE_P1_MOVES = [0, 2, 1, 3, 2, 5];
export const TIE_P2_MOVES = [5, 5, 4, 4, 5, 3];

/**
 * Play the three move phases with the given move lists, betting `bet`
 * coins from each side in every betting round. Returns the game in the
 * reveal phase.
 */
export function playMoves(
  game: GameState,
  p1Moves: number[],
  p2Moves: number[],
  bet = 0
): GameState {
  let g = game;
  for (let i = 0; i < 3; i++) {
    g = makeMove(g, P1.id, p1Moves[i * 2], p1Moves[i * 2 + 1]);
    g = makeMove(g, P2.id, p2Moves[i * 2], p2Moves[i * 2 + 1]);
    g = makeBet(g, P1.id, bet);
    g = makeBet(g, P2.id, bet);
  }
  return g;
}

/** Reveal for both players and pass the final bet with checks. */
export function revealAndCheck(game: GameState, p1Reveal: number, p2Reveal: number): GameState {
  let g = makeRevealMove(game, P1.id, p1Reveal);
  g = makeRevealMove(g, P2.id, p2Reveal);
  g = makeBet(g, P1.id, 0);
  g = makeBet(g, P2.id, 0);
  return g;
}
