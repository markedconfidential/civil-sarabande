/**
 * Scoring Logic
 *
 * Computes scores and determines winners based on player moves
 * and the magic square board.
 *
 * Reference: reference/server/server.php (cm_computeLoser function)
 */

import {
  type MagicSquare,
  type MoveList,
  GAME_CONSTANTS,
} from "@civil-sarabande/shared";

const { BOARD_SIZE, MOVES_PER_ROUND } = GAME_CONSTANTS;

/**
 * Compute scores for both players based on their moves.
 *
 * Each player's score is the sum of 3 cells determined by:
 * - The columns they chose for themselves
 * - The rows their opponent chose for them
 *
 * Note: Player 2's moves are mirrored (row 5 = column 0 from their perspective).
 *
 * @param board - The 6x6 magic square
 * @param p1Moves - Player 1's moves [selfCol, otherRow, ...] (6 elements)
 * @param p2Moves - Player 2's moves [selfCol, otherRow, ...] (6 elements)
 * @returns Scores for both players
 */
export function computeScores(
  board: MagicSquare,
  p1Moves: MoveList,
  p2Moves: MoveList
): { p1Score: number; p2Score: number } {
  let p1Score = 0;
  let p2Score = 0;

  for (let i = 0; i < MOVES_PER_ROUND; i++) {
    const p1SelfChoice = p1Moves[i * 2]; // Column P1 chose for themselves
    const p1OtherChoice = p1Moves[i * 2 + 1]; // Row P1 assigned to P2

    // P2's perspective is mirrored (their row 0 = our row 5)
    const p2SelfChoice = BOARD_SIZE - 1 - p2Moves[i * 2];
    const p2OtherChoice = BOARD_SIZE - 1 - p2Moves[i * 2 + 1];

    // P1's cell: intersection of their column and P2's row assignment to them
    p1Score += board[p2OtherChoice * BOARD_SIZE + p1SelfChoice];

    // P2's cell: intersection of their column and P1's row assignment to them
    p2Score += board[p2SelfChoice * BOARD_SIZE + p1OtherChoice];
  }

  return { p1Score, p2Score };
}

/**
 * Determine the winner of a round.
 *
 * @param board - The 6x6 magic square
 * @param p1Moves - Player 1's complete moves (7 elements, including reveal)
 * @param p2Moves - Player 2's complete moves (7 elements, including reveal)
 * @returns 'player1' | 'player2' | 'tie'
 */
export function determineWinner(
  board: MagicSquare,
  p1Moves: MoveList,
  p2Moves: MoveList
): "player1" | "player2" | "tie" {
  const { p1Score, p2Score } = computeScores(board, p1Moves, p2Moves);

  if (p1Score > p2Score) return "player1";
  if (p2Score > p1Score) return "player2";
  return "tie";
}

/**
 * Get the cells that would be scored for a player given the current moves.
 * Useful for UI highlighting and score previews.
 *
 * @param board - The 6x6 magic square
 * @param playerMoves - The player's moves (columns they chose)
 * @param opponentMoves - The opponent's moves (rows they assigned)
 * @param isPlayer2 - Whether this is for player 2 (requires mirroring)
 * @returns Array of {row, col, value} for each scored cell
 */
export function getScoredCells(
  board: MagicSquare,
  playerMoves: MoveList,
  opponentMoves: MoveList,
  isPlayer2: boolean
): Array<{ row: number; col: number; value: number }> {
  const cells: Array<{ row: number; col: number; value: number }> = [];
  const numMoves = Math.min(
    Math.floor(playerMoves.length / 2),
    Math.floor(opponentMoves.length / 2),
    MOVES_PER_ROUND
  );

  for (let i = 0; i < numMoves; i++) {
    let selfChoice = playerMoves[i * 2];
    let otherChoice = opponentMoves[i * 2 + 1];

    if (isPlayer2) {
      selfChoice = BOARD_SIZE - 1 - selfChoice;
      otherChoice = BOARD_SIZE - 1 - otherChoice;
    }

    const row = otherChoice;
    const col = selfChoice;
    const value = board[row * BOARD_SIZE + col];

    cells.push({ row, col, value });
  }

  return cells;
}

