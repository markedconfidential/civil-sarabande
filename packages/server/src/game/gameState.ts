/**
 * Game State Management
 *
 * State machine for managing game flow and transitions.
 *
 * Reference: reference/server/protocol.txt for the game flow
 */

import {
  type GameState,
  type GamePhase,
  type Player,
  type MagicSquare,
  GAME_CONSTANTS,
} from "@civil-sarabande/shared";
import { generateMagicSquare } from "./magicSquare";

const { STARTING_COINS } = GAME_CONSTANTS;

/**
 * Generate a unique game ID.
 */
function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new game in the waiting state.
 *
 * @param player1 - The player creating the game
 * @param stake - The stake amount for the game
 * @param seed - Optional seed for deterministic board generation
 * @returns A new game state
 */
export function createGame(
  player1: Player,
  stake: number,
  seed?: number
): GameState {
  const actualSeed = seed ?? Date.now();
  const board = generateMagicSquare(actualSeed);

  return {
    gameId: generateGameId(),
    board,
    phase: "waiting",
    player1,
    player2: null,
    player1Moves: [],
    player2Moves: [],
    player1Coins: STARTING_COINS,
    player2Coins: STARTING_COINS,
    player1PotCoins: 0,
    player2PotCoins: 0,
    roundNumber: 1,
    stake,
    createdAt: Date.now(),
  };
}

/**
 * Join an existing game as player 2.
 *
 * @param state - Current game state (must be in 'waiting' phase)
 * @param player2 - The player joining the game
 * @returns Updated game state with player 2 joined
 */
export function joinGame(state: GameState, player2: Player): GameState {
  if (state.phase !== "waiting") {
    throw new Error(`Cannot join game in phase: ${state.phase}`);
  }

  if (state.player2 !== null) {
    throw new Error("Game already has two players");
  }

  // Start with the first ante
  const anteCoins = 1;

  return {
    ...state,
    player2,
    phase: "move1",
    player1Coins: STARTING_COINS - anteCoins,
    player2Coins: STARTING_COINS - anteCoins,
    player1PotCoins: anteCoins,
    player2PotCoins: anteCoins,
  };
}

/**
 * Get the next phase after a given phase.
 */
function getNextPhase(currentPhase: GamePhase): GamePhase {
  const phaseOrder: GamePhase[] = [
    "waiting",
    "move1",
    "bet1",
    "move2",
    "bet2",
    "move3",
    "bet3",
    "reveal",
    "finalBet",
    "roundEnd",
    "ended",
  ];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return currentPhase;
  }

  return phaseOrder[currentIndex + 1];
}

/**
 * Check if a phase transition should happen.
 * Transitions occur when both players have completed their actions for the current phase.
 *
 * @param state - Current game state
 * @returns true if ready to transition to next phase
 */
export function isReadyForNextPhase(state: GameState): boolean {
  const { phase, player1Moves, player2Moves, player1PotCoins, player2PotCoins } = state;

  switch (phase) {
    case "move1":
    case "move2":
    case "move3": {
      // Both players need to have made their move (2 values each)
      const expectedMoves = (parseInt(phase.slice(-1)) * 2);
      return player1Moves.length >= expectedMoves && player2Moves.length >= expectedMoves;
    }

    case "bet1":
    case "bet2":
    case "bet3":
    case "finalBet": {
      // Betting round complete when pot coins are equal
      return player1PotCoins === player2PotCoins;
    }

    case "reveal": {
      // Both players need to have made their reveal move (7th element)
      return player1Moves.length >= 7 && player2Moves.length >= 7;
    }

    default:
      return false;
  }
}

/**
 * Transition to the next phase if ready.
 *
 * @param state - Current game state
 * @returns Updated game state (may be same state if not ready to transition)
 */
export function tryTransition(state: GameState): GameState {
  if (!isReadyForNextPhase(state)) {
    return state;
  }

  const nextPhase = getNextPhase(state.phase);

  return {
    ...state,
    phase: nextPhase,
  };
}

/**
 * Make a move for a player.
 *
 * @param state - Current game state
 * @param playerId - ID of the player making the move
 * @param selfColumn - Column the player chooses for themselves (0-5)
 * @param otherRow - Row the player assigns to their opponent (0-5)
 * @returns Updated game state
 */
export function makeMove(
  state: GameState,
  playerId: string,
  selfColumn: number,
  otherRow: number
): GameState {
  // Validate phase
  if (!state.phase.startsWith("move")) {
    throw new Error(`Cannot make move in phase: ${state.phase}`);
  }

  // Validate move values
  if (selfColumn < 0 || selfColumn > 5 || otherRow < 0 || otherRow > 5) {
    throw new Error("Move values must be between 0 and 5");
  }

  // Determine which player
  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  // Add moves
  const newState = { ...state };

  if (isPlayer1) {
    newState.player1Moves = [...state.player1Moves, selfColumn, otherRow];
  } else {
    newState.player2Moves = [...state.player2Moves, selfColumn, otherRow];
  }

  return tryTransition(newState);
}

/**
 * Make a reveal move for a player.
 *
 * @param state - Current game state
 * @param playerId - ID of the player making the reveal
 * @param revealColumn - Which of their 3 columns to reveal (must be one they chose)
 * @returns Updated game state
 */
export function makeRevealMove(
  state: GameState,
  playerId: string,
  revealColumn: number
): GameState {
  if (state.phase !== "reveal") {
    throw new Error(`Cannot make reveal move in phase: ${state.phase}`);
  }

  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  const playerMoves = isPlayer1 ? state.player1Moves : state.player2Moves;

  // Validate that revealColumn is one of their chosen columns
  const chosenColumns = [playerMoves[0], playerMoves[2], playerMoves[4]];
  if (!chosenColumns.includes(revealColumn)) {
    throw new Error("Reveal column must be one of your chosen columns");
  }

  const newState = { ...state };

  if (isPlayer1) {
    newState.player1Moves = [...state.player1Moves, revealColumn];
  } else {
    newState.player2Moves = [...state.player2Moves, revealColumn];
  }

  return tryTransition(newState);
}

