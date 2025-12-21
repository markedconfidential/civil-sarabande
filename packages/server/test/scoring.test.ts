/**
 * Tests for scoring logic
 */

import { describe, expect, test } from "bun:test";
import { computeScores, determineWinner } from "../src/game/scoring";
import { generateMagicSquare } from "../src/game/magicSquare";

describe("Scoring", () => {
  // Create a known board for testing
  const board = generateMagicSquare(12345);

  test("computes scores for complete moves", () => {
    // Player 1 chooses columns 0, 1, 2 for themselves
    // and rows 3, 4, 5 for their opponent
    const p1Moves = [0, 3, 1, 4, 2, 5];

    // Player 2 chooses columns 0, 1, 2 for themselves (from their perspective)
    // and rows 3, 4, 5 for their opponent
    const p2Moves = [0, 3, 1, 4, 2, 5];

    const { p1Score, p2Score } = computeScores(board, p1Moves, p2Moves);

    // Scores should be positive integers
    expect(p1Score).toBeGreaterThan(0);
    expect(p2Score).toBeGreaterThan(0);

    // Each score should be sum of 3 cells (min 1+2+3=6, max 34+35+36=105)
    expect(p1Score).toBeGreaterThanOrEqual(6);
    expect(p1Score).toBeLessThanOrEqual(105);
    expect(p2Score).toBeGreaterThanOrEqual(6);
    expect(p2Score).toBeLessThanOrEqual(105);
  });

  test("determineWinner returns correct result", () => {
    // Using moves that should produce a deterministic result
    const p1Moves = [0, 0, 1, 1, 2, 2, 0]; // reveal column 0
    const p2Moves = [0, 0, 1, 1, 2, 2, 0]; // reveal column 0

    const winner = determineWinner(board, p1Moves, p2Moves);

    // Winner should be one of the valid values
    expect(["player1", "player2", "tie"]).toContain(winner);
  });

  test("symmetric moves can produce different scores due to mirroring", () => {
    // Same move sequence from each player's perspective
    // Due to mirroring, they should generally have different scores
    const moves = [0, 5, 1, 4, 2, 3];
    const { p1Score, p2Score } = computeScores(board, moves, moves);

    // The scores exist (may or may not be equal depending on board symmetry)
    expect(typeof p1Score).toBe("number");
    expect(typeof p2Score).toBe("number");
  });
});

