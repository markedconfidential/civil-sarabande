/**
 * Tests for magic square generation
 */

import { describe, expect, test } from "bun:test";
import {
  generateMagicSquare,
  isValidMagicSquare,
  measureDeviation,
} from "../src/game/magicSquare";
import { GAME_CONSTANTS } from "@civil-sarabande/shared";

const { MAGIC_SUM, BOARD_SIZE, TOTAL_CELLS } = GAME_CONSTANTS;

describe("Magic Square Generation", () => {
  test("generates a board with 36 cells", () => {
    const board = generateMagicSquare(12345);
    expect(board.length).toBe(TOTAL_CELLS);
  });

  test("generates a board with numbers 1-36", () => {
    const board = generateMagicSquare(12345);
    const sorted = [...board].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  test("generates a valid magic square", () => {
    const board = generateMagicSquare(12345);
    expect(isValidMagicSquare(board)).toBe(true);
    expect(measureDeviation(board)).toBe(0);
  });

  test("all rows sum to 111", () => {
    const board = generateMagicSquare(12345);
    for (let row = 0; row < BOARD_SIZE; row++) {
      let sum = 0;
      for (let col = 0; col < BOARD_SIZE; col++) {
        sum += board[row * BOARD_SIZE + col];
      }
      expect(sum).toBe(MAGIC_SUM);
    }
  });

  test("all columns sum to 111", () => {
    const board = generateMagicSquare(12345);
    for (let col = 0; col < BOARD_SIZE; col++) {
      let sum = 0;
      for (let row = 0; row < BOARD_SIZE; row++) {
        sum += board[row * BOARD_SIZE + col];
      }
      expect(sum).toBe(MAGIC_SUM);
    }
  });

  test("both diagonals sum to 111", () => {
    const board = generateMagicSquare(12345);

    let diag1 = 0;
    let diag2 = 0;
    for (let i = 0; i < BOARD_SIZE; i++) {
      diag1 += board[i * BOARD_SIZE + i];
      diag2 += board[i * BOARD_SIZE + (BOARD_SIZE - 1 - i)];
    }

    expect(diag1).toBe(MAGIC_SUM);
    expect(diag2).toBe(MAGIC_SUM);
  });

  test("same seed produces same board", () => {
    const board1 = generateMagicSquare(42);
    const board2 = generateMagicSquare(42);
    expect(board1).toEqual(board2);
  });

  test("different seeds produce different boards", () => {
    const board1 = generateMagicSquare(1);
    const board2 = generateMagicSquare(2);
    expect(board1).not.toEqual(board2);
  });

  test("generates valid squares for multiple seeds", () => {
    // Test a variety of seeds to ensure robustness
    const seeds = [0, 1, 100, 9999, Date.now()];
    for (const seed of seeds) {
      const board = generateMagicSquare(seed);
      expect(isValidMagicSquare(board)).toBe(true);
    }
  });
});

