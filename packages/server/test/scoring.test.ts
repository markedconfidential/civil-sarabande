/**
 * Tests for scoring logic, with every expected value computed by hand.
 *
 * computeScores(board, p1Moves, p2Moves) scores three cells per player:
 *
 *   p1 cell i = board[ (5 - p2Moves[2i+1]) * 6 + p1Moves[2i] ]
 *               row: the row player 2 assigned to player 1, mirrored
 *               col: the column player 1 chose for themselves
 *
 *   p2 cell i = board[ (5 - p2Moves[2i]) * 6 + p1Moves[2i+1] ]
 *               row: the column player 2 chose for themselves, mirrored
 *               col: the row player 1 assigned to player 2
 *
 * Player 2 sits on the opposite side of the table, so every value they
 * send is in mirrored coordinates (their 0 is the board's 5).
 */

import { describe, expect, test } from "bun:test";
import { computeScores, determineWinner, getScoredCells } from "../src/game/scoring";
import { generateMagicSquare, isValidMagicSquare } from "../src/game/magicSquare";

/**
 * generateMagicSquare(12345), written out so the arithmetic below can be
 * checked by eye. Rows top to bottom:
 */
const MAGIC_BOARD = [
  19, 9, 33, 13, 35, 2, //  row 0
  18, 30, 16, 31, 12, 4, //  row 1
  7, 3, 17, 24, 28, 32, //  row 2
  8, 34, 21, 15, 11, 22, //  row 3
  36, 29, 14, 1, 5, 26, //  row 4
  23, 6, 10, 27, 20, 25, //  row 5
];

/** A plain counting board: cell (row, col) holds 6*row + col + 1. */
const COUNTING_BOARD = Array.from({ length: 36 }, (_, i) => i + 1);

describe("Scoring", () => {
  test("the literal board is the seed-12345 magic square", () => {
    expect(isValidMagicSquare(MAGIC_BOARD)).toBe(true);
    expect(generateMagicSquare(12345)).toEqual(MAGIC_BOARD);
  });

  test("counting board: cells resolve to the expected coordinates", () => {
    // p1: columns 2, 0, 5 for self; rows 4, 1, 3 for opponent
    const p1Moves = [2, 4, 0, 1, 5, 3];
    // p2 (mirrored): columns 1, 3, 4 for self; rows 2, 0, 5 for opponent
    const p2Moves = [1, 2, 3, 0, 4, 5];

    // p1 cells (row = 5 - p2 row, col = p1 col):
    //   i=0: row 5-2=3, col 2 -> 6*3+2+1 = 21
    //   i=1: row 5-0=5, col 0 -> 6*5+0+1 = 31
    //   i=2: row 5-5=0, col 5 -> 6*0+5+1 = 6
    //   total 58
    // p2 cells (row = 5 - p2 col, col = p1 row):
    //   i=0: row 5-1=4, col 4 -> 6*4+4+1 = 29
    //   i=1: row 5-3=2, col 1 -> 6*2+1+1 = 14
    //   i=2: row 5-4=1, col 3 -> 6*1+3+1 = 10
    //   total 53
    const { p1Score, p2Score } = computeScores(COUNTING_BOARD, p1Moves, p2Moves);
    expect(p1Score).toBe(58);
    expect(p2Score).toBe(53);

    expect(getScoredCells(COUNTING_BOARD, p1Moves, p2Moves, false)).toEqual([
      { row: 3, col: 2, value: 21 },
      { row: 5, col: 0, value: 31 },
      { row: 0, col: 5, value: 6 },
    ]);
    expect(getScoredCells(COUNTING_BOARD, p2Moves, p1Moves, true)).toEqual([
      { row: 4, col: 4, value: 29 },
      { row: 2, col: 1, value: 14 },
      { row: 1, col: 3, value: 10 },
    ]);
  });

  test("magic board: identical move lists score differently because of mirroring", () => {
    const moves = [0, 3, 1, 4, 2, 5];

    // p1 cells:
    //   i=0: row 5-3=2, col 0 -> 7
    //   i=1: row 5-4=1, col 1 -> 30
    //   i=2: row 5-5=0, col 2 -> 33
    //   total 70
    // p2 cells:
    //   i=0: row 5-0=5, col 3 -> 27
    //   i=1: row 5-1=4, col 4 -> 5
    //   i=2: row 5-2=3, col 5 -> 22
    //   total 54
    const { p1Score, p2Score } = computeScores(MAGIC_BOARD, moves, moves);
    expect(p1Score).toBe(70);
    expect(p2Score).toBe(54);
    expect(determineWinner(MAGIC_BOARD, [...moves, 0], [...moves, 0])).toBe("player1");
  });

  test("magic board: player 2 perspective wins", () => {
    const moves = [5, 0, 4, 1, 3, 2];

    // p1 cells:
    //   i=0: row 5-0=5, col 5 -> 25
    //   i=1: row 5-1=4, col 4 -> 5
    //   i=2: row 5-2=3, col 3 -> 15
    //   total 45
    // p2 cells:
    //   i=0: row 5-5=0, col 0 -> 19
    //   i=1: row 5-4=1, col 1 -> 30
    //   i=2: row 5-3=2, col 2 -> 17
    //   total 66
    const { p1Score, p2Score } = computeScores(MAGIC_BOARD, moves, moves);
    expect(p1Score).toBe(45);
    expect(p2Score).toBe(66);
    expect(determineWinner(MAGIC_BOARD, [...moves, 5], [...moves, 5])).toBe("player2");
  });

  test("magic board: a hand-built tie", () => {
    const p1Moves = [0, 2, 1, 3, 2, 5];
    const p2Moves = [5, 5, 4, 4, 5, 3];

    // p1 cells:
    //   i=0: row 5-5=0, col 0 -> 19
    //   i=1: row 5-4=1, col 1 -> 30
    //   i=2: row 5-3=2, col 2 -> 17
    //   total 66
    // p2 cells:
    //   i=0: row 5-5=0, col 2 -> 33
    //   i=1: row 5-4=1, col 3 -> 31
    //   i=2: row 5-5=0, col 5 -> 2
    //   total 66
    const { p1Score, p2Score } = computeScores(MAGIC_BOARD, p1Moves, p2Moves);
    expect(p1Score).toBe(66);
    expect(p2Score).toBe(66);
    expect(determineWinner(MAGIC_BOARD, [...p1Moves, 0], [...p2Moves, 5])).toBe("tie");
  });

  test("partial scoring counts only the requested move pairs", () => {
    const moves = [0, 3, 1, 4, 2, 5];
    // First pair only: p1 -> 7, p2 -> 27 (see the mirroring test above)
    expect(computeScores(MAGIC_BOARD, moves.slice(0, 2), moves.slice(0, 2), 1)).toEqual({
      p1Score: 7,
      p2Score: 27,
    });
    // First two pairs: p1 -> 7 + 30, p2 -> 27 + 5
    expect(computeScores(MAGIC_BOARD, moves.slice(0, 4), moves.slice(0, 4), 2)).toEqual({
      p1Score: 37,
      p2Score: 32,
    });
    expect(computeScores(MAGIC_BOARD, [], [], 0)).toEqual({ p1Score: 0, p2Score: 0 });
  });
});
