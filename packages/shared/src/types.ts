/**
 * Core type definitions for Civil Sarabande
 */

/**
 * A 6x6 magic square stored as a flat array (row-major order).
 * Contains numbers 1-36 where every row, column, and diagonal sums to 111.
 */
export type MagicSquare = readonly number[];

/**
 * List of moves made by a player.
 * Format: [selfCol, otherRow, selfCol, otherRow, selfCol, otherRow, revealCol]
 * - Indices 0,2,4: columns the player chose for themselves
 * - Indices 1,3,5: rows the player assigned to their opponent
 * - Index 6: which of their 3 columns to reveal for scoring
 */
export type MoveList = number[];

/**
 * Game phases representing the state machine of a single round.
 */
export type GamePhase =
  | "waiting" // Waiting for opponent to join
  | "move1" // First move phase (both players pick column/row)
  | "bet1" // First betting round
  | "move2" // Second move phase
  | "bet2" // Second betting round
  | "move3" // Third move phase
  | "bet3" // Third betting round
  | "reveal" // Reveal phase (pick which column to score)
  | "finalBet" // Final betting round
  | "roundEnd" // Round complete, distributing coins
  | "ended"; // Game over (one player out of coins or left)

/**
 * A player in the game.
 */
export interface Player {
  /** Unique player identifier */
  id: string;
  /** Ethereum wallet address (optional until crypto integration) */
  address?: string;
  /** Display name */
  name?: string;
}

/**
 * The complete state of a game.
 */
export interface GameState {
  /** Unique game identifier */
  gameId: string;
  /** The 6x6 magic square board */
  board: MagicSquare;
  /** Current phase of the game */
  phase: GamePhase;
  /** Player 1 (game creator) */
  player1: Player;
  /** Player 2 (joiner, null if waiting) */
  player2: Player | null;
  /** Player 1's moves so far */
  player1Moves: MoveList;
  /** Player 2's moves so far */
  player2Moves: MoveList;
  /** Player 1's remaining coins (not in pot) */
  player1Coins: number;
  /** Player 2's remaining coins (not in pot) */
  player2Coins: number;
  /** Player 1's coins in the pot */
  player1PotCoins: number;
  /** Player 2's coins in the pot */
  player2PotCoins: number;
  /** Whether player 1 has made their bet this betting round */
  player1BetMade: boolean;
  /** Whether player 2 has made their bet this betting round */
  player2BetMade: boolean;
  /** Last matched pot amount (when both players have equal pot coins) */
  settledPotCoins: number;
  /** Whether player 1 has signaled ready to end the round */
  player1EndedRound: boolean;
  /** Whether player 2 has signaled ready to end the round */
  player2EndedRound: boolean;
  /** Current round number (starts at 1) */
  roundNumber: number;
  /** Stake amount in smallest currency unit */
  stake: number;
  /** Timestamp when game was created */
  createdAt: number;
}

/**
 * Constants for the game.
 */
export const GAME_CONSTANTS = {
  /** Size of the board (6x6) */
  BOARD_SIZE: 6,
  /** Total cells on the board */
  TOTAL_CELLS: 36,
  /** Magic sum for a 6x6 magic square */
  MAGIC_SUM: 111,
  /** Starting coins per player */
  STARTING_COINS: 100,
  /** Number of move phases per round */
  MOVES_PER_ROUND: 3,
  /** Base ante for round 1 */
  ANTE_BASE: 1,
  /** Ante increase per round */
  ANTE_INCREASE: 1,
  /** Base penalty for leaving mid-game */
  LEAVE_PENALTY_BASE: 6,
  /** Penalty increase per round */
  LEAVE_PENALTY_INCREASE: 0.5,
} as const;

/**
 * Calculate the ante for a given round number.
 */
export function getAnte(roundNumber: number): number {
  return (
    GAME_CONSTANTS.ANTE_BASE +
    Math.floor(GAME_CONSTANTS.ANTE_INCREASE * (roundNumber - 1))
  );
}

/**
 * Calculate the leave penalty for a given round number.
 */
export function getLeavePenalty(roundNumber: number): number {
  return (
    GAME_CONSTANTS.LEAVE_PENALTY_BASE +
    Math.floor(GAME_CONSTANTS.LEAVE_PENALTY_INCREASE * (roundNumber - 1))
  );
}

