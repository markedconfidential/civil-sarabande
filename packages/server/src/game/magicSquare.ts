/**
 * Magic Square Generation
 *
 * Generates valid 6x6 magic squares where every row, column, and diagonal
 * sums to 111 (the magic constant for a 6x6 square).
 *
 * Algorithm: Tabu search based on "Yet Another Local Search Method for
 * Constraint Solving" by Codognet and Diaz.
 *
 * Reference: reference/server/magicSquare6.cpp
 */

import { type MagicSquare, GAME_CONSTANTS } from "@civil-sarabande/shared";

const { BOARD_SIZE, MAGIC_SUM, TOTAL_CELLS } = GAME_CONSTANTS;

/**
 * Simple seeded random number generator (Mulberry32)
 * Provides deterministic randomness for reproducible boards.
 */
function createSeededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with seeded random
 */
function shuffleArray(array: number[], random: () => number): number[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Measure how far a square is from being magic.
 * Returns 0 for a valid magic square.
 */
export function measureDeviation(board: MagicSquare): number {
  let deviation = 0;

  // Check rows and columns
  for (let i = 0; i < BOARD_SIZE; i++) {
    let rowSum = 0;
    let colSum = 0;
    for (let j = 0; j < BOARD_SIZE; j++) {
      rowSum += board[i * BOARD_SIZE + j];
      colSum += board[j * BOARD_SIZE + i];
    }
    deviation += Math.abs(rowSum - MAGIC_SUM);
    deviation += Math.abs(colSum - MAGIC_SUM);
  }

  // Check diagonals
  let diag1 = 0;
  let diag2 = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    diag1 += board[i * BOARD_SIZE + i];
    diag2 += board[i * BOARD_SIZE + (BOARD_SIZE - 1 - i)];
  }
  deviation += Math.abs(diag1 - MAGIC_SUM);
  deviation += Math.abs(diag2 - MAGIC_SUM);

  return deviation;
}

/**
 * Check if a board is a valid magic square.
 */
export function isValidMagicSquare(board: MagicSquare): boolean {
  if (board.length !== TOTAL_CELLS) return false;
  return measureDeviation(board) === 0;
}

/**
 * Generate a magic square using tabu search.
 *
 * @param seed - Random seed for deterministic generation
 * @returns A valid 6x6 magic square
 */
export function generateMagicSquare(seed: number): MagicSquare {
  const random = createSeededRandom(seed);

  // Start with shuffled 1-36
  let board = shuffleArray(
    Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1),
    random
  );

  // Tabu search parameters (tuned from reference implementation)
  const tabuTenureLimit = 2 * BOARD_SIZE;
  const tabuListLimit = Math.floor(0.1 * BOARD_SIZE + 2);
  const tabuResetPercentage = 0.5;
  const tryLimit = 1000;
  const scramblesOnRetry = 35;

  const tabuFlags: boolean[] = new Array(TOTAL_CELLS).fill(false);
  const tabuTenures: number[] = new Array(TOTAL_CELLS).fill(0);

  let numTries = 0;
  let totalTries = 0;
  let currentTryLimit = tryLimit;

  while (measureDeviation(board) > 0) {
    const oldDeviation = measureDeviation(board);

    // Check if we should restart
    if (numTries > currentTryLimit) {
      currentTryLimit++; // Avoid phase alignment issues

      if (totalTries > currentTryLimit * 10) {
        // Full random restart
        board = shuffleArray(
          Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1),
          random
        );
        totalTries = 0;
      } else {
        // Scramble restart
        for (let i = 0; i < scramblesOnRetry; i++) {
          const a = Math.floor(random() * TOTAL_CELLS);
          const b = Math.floor(random() * TOTAL_CELLS);
          [board[a], board[b]] = [board[b], board[a]];
        }
      }

      numTries = 0;
      tabuFlags.fill(false);
      tabuTenures.fill(0);
    }

    numTries++;
    totalTries++;

    // Update tabu tenures
    let tabuSize = 0;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (tabuFlags[i]) {
        tabuTenures[i]++;
        if (tabuTenures[i] > tabuTenureLimit) {
          tabuFlags[i] = false;
          tabuTenures[i] = 0;
        } else {
          tabuSize++;
        }
      }
    }

    // Reset some tabu entries if list is too large
    if (tabuSize > tabuListLimit) {
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (tabuFlags[i] && random() <= tabuResetPercentage) {
          tabuFlags[i] = false;
          tabuTenures[i] = 0;
        }
      }
    }

    // Compute cell errors
    const rowErrors: number[] = new Array(BOARD_SIZE);
    const colErrors: number[] = new Array(BOARD_SIZE);
    let diag1Sum = 0;
    let diag2Sum = 0;

    for (let i = 0; i < BOARD_SIZE; i++) {
      let rowSum = 0;
      let colSum = 0;
      for (let j = 0; j < BOARD_SIZE; j++) {
        rowSum += board[i * BOARD_SIZE + j];
        colSum += board[j * BOARD_SIZE + i];
      }
      rowErrors[i] = rowSum - MAGIC_SUM;
      colErrors[i] = colSum - MAGIC_SUM;
      diag1Sum += board[i * BOARD_SIZE + i];
      diag2Sum += board[i * BOARD_SIZE + (BOARD_SIZE - 1 - i)];
    }

    const diagErrors = [diag1Sum - MAGIC_SUM, diag2Sum - MAGIC_SUM];

    const cellErrors: number[] = new Array(TOTAL_CELLS);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const i = y * BOARD_SIZE + x;
        let error = Math.abs(rowErrors[y]) + Math.abs(colErrors[x]);
        if (y === x) error += Math.abs(diagErrors[0]);
        if (y === BOARD_SIZE - 1 - x) error += Math.abs(diagErrors[1]);
        cellErrors[i] = error;
      }
    }

    // Find non-tabu cell with biggest error
    let biggestError = 0;
    let biggestErrorCell = -1;
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!tabuFlags[i] && cellErrors[i] > biggestError) {
        biggestError = cellErrors[i];
        biggestErrorCell = i;
      }
    }

    if (biggestErrorCell === -1) continue;

    // Find best swap
    let bestSwapDeviation = BOARD_SIZE * MAGIC_SUM;
    let bestSwapIndex = -1;

    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (i !== biggestErrorCell && !tabuFlags[i]) {
        // Try swap
        [board[biggestErrorCell], board[i]] = [
          board[i],
          board[biggestErrorCell],
        ];
        const deviation = measureDeviation(board);
        if (deviation <= bestSwapDeviation) {
          bestSwapDeviation = deviation;
          bestSwapIndex = i;
        }
        // Swap back
        [board[biggestErrorCell], board[i]] = [
          board[i],
          board[biggestErrorCell],
        ];
      }
    }

    if (bestSwapIndex === -1) continue;

    // Mark as tabu if no improvement
    if (bestSwapDeviation >= oldDeviation) {
      tabuFlags[biggestErrorCell] = true;
      tabuTenures[biggestErrorCell] = 0;
    }

    // Make the swap
    [board[biggestErrorCell], board[bestSwapIndex]] = [
      board[bestSwapIndex],
      board[biggestErrorCell],
    ];
  }

  return board;
}

