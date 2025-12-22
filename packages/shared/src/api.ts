/**
 * API Types
 *
 * Request and response types for the REST API.
 */

import type { GamePhase, MagicSquare, MoveList, Player } from "./types";

// ============================================================================
// Request Types
// ============================================================================

/** Request to create a new game */
export interface CreateGameRequest {
  /** Player creating the game */
  player: Player;
  /** Stake amount for the game */
  stake: number;
}

/** Request to join an existing game */
export interface JoinGameRequest {
  /** Player joining the game */
  player: Player;
}

/** Request to make a move */
export interface MakeMoveRequest {
  /** ID of the player making the move */
  playerId: string;
  /** Column the player chooses for themselves (0-5) */
  selfColumn: number;
  /** Row the player assigns to their opponent (0-5) */
  otherRow: number;
}

/** Request to place a bet */
export interface MakeBetRequest {
  /** ID of the player making the bet */
  playerId: string;
  /** Number of coins to add to the pot */
  amount: number;
}

/** Request to fold */
export interface FoldRequest {
  /** ID of the player folding */
  playerId: string;
}

/** Request to make a reveal move */
export interface RevealMoveRequest {
  /** ID of the player making the reveal */
  playerId: string;
  /** Which of their 3 columns to reveal (must be one they chose) */
  revealColumn: number;
}

/** Request to end the round */
export interface EndRoundRequest {
  /** ID of the player signaling end */
  playerId: string;
}

/** Request to leave a game */
export interface LeaveGameRequest {
  /** ID of the player leaving */
  playerId: string;
}

// ============================================================================
// Response Types
// ============================================================================

/** Player-specific view of the game state */
export interface GameStateView {
  /** Unique game identifier */
  gameId: string;
  /** The 6x6 magic square board */
  board: MagicSquare;
  /** Current phase of the game */
  phase: GamePhase;
  /** Player 1 info */
  player1: Player;
  /** Player 2 info (null if waiting) */
  player2: Player | null;
  /** Current round number */
  roundNumber: number;
  /** Stake amount */
  stake: number;
  /** Timestamp when game was created */
  createdAt: number;

  // Player-specific coin info
  /** Your remaining coins */
  yourCoins: number;
  /** Opponent's remaining coins */
  theirCoins: number;
  /** Your coins in the pot */
  yourPotCoins: number;
  /** Opponent's coins in the pot */
  theirPotCoins: number;

  // Betting state
  /** Whether you have made your bet this round */
  yourBetMade: boolean;
  /** Whether opponent has made their bet this round */
  theirBetMade: boolean;
  /** Last matched pot amount */
  settledPotCoins: number;

  // Round end state
  /** Whether you have signaled round end */
  yourEndedRound: boolean;
  /** Whether opponent has signaled round end */
  theirEndedRound: boolean;

  // Moves (only revealed moves shown for opponent)
  /** Your moves so far */
  yourMoves: MoveList;
  /**
   * Opponent's moves (truncated to only show moves that are "committed"
   * i.e., both players have made their move for that phase)
   */
  theirMoves: MoveList;

  /** Which player you are */
  yourRole: "player1" | "player2";
}

/** Response for successful game creation */
export interface CreateGameResponse {
  /** The created game state */
  game: GameStateView;
}

/** Response for listing waiting games */
export interface WaitingGamesResponse {
  /** List of games available to join */
  games: Array<{
    gameId: string;
    player1: Player;
    stake: number;
    createdAt: number;
  }>;
}

/** Generic error response */
export interface ErrorResponse {
  /** Error message */
  error: string;
}

/** Generic success response */
export interface SuccessResponse {
  /** Success indicator */
  success: true;
  /** Updated game state */
  game: GameStateView;
}

