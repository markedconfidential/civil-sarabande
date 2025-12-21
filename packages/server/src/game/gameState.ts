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
  GAME_CONSTANTS,
  getAnte,
  getLeavePenalty,
} from "@civil-sarabande/shared";
import { generateMagicSquare } from "./magicSquare";
import { determineWinner } from "./scoring";

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
    player1BetMade: false,
    player2BetMade: false,
    settledPotCoins: 0,
    player1EndedRound: false,
    player2EndedRound: false,
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
  const anteCoins = getAnte(state.roundNumber);

  return {
    ...state,
    player2,
    phase: "move1",
    player1Coins: STARTING_COINS - anteCoins,
    player2Coins: STARTING_COINS - anteCoins,
    player1PotCoins: anteCoins,
    player2PotCoins: anteCoins,
    player1BetMade: true, // Ante counts as initial bet
    player2BetMade: true,
    settledPotCoins: anteCoins,
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
  const {
    phase,
    player1Moves,
    player2Moves,
    player1PotCoins,
    player2PotCoins,
    player1BetMade,
    player2BetMade,
  } = state;

  switch (phase) {
    case "move1":
    case "move2":
    case "move3": {
      // Both players need to have made their move (2 values each)
      const expectedMoves = parseInt(phase.slice(-1)) * 2;
      return (
        player1Moves.length >= expectedMoves &&
        player2Moves.length >= expectedMoves
      );
    }

    case "bet1":
    case "bet2":
    case "bet3":
    case "finalBet": {
      // Betting round complete when both have bet and pot coins are equal
      return (
        player1BetMade &&
        player2BetMade &&
        player1PotCoins === player2PotCoins
      );
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

  // Determine phase types
  const isMovePhase = state.phase.startsWith("move") || state.phase === "reveal";
  const isNextBettingPhase =
    nextPhase.startsWith("bet") || nextPhase === "finalBet";

  // Reset bet flags when transitioning from move/reveal phase to betting phase
  // This allows players to make new bets in the upcoming betting round
  const shouldResetBetFlags = isMovePhase && isNextBettingPhase;

  return {
    ...state,
    phase: nextPhase,
    // Reset bet flags when entering a new betting phase
    player1BetMade: shouldResetBetFlags ? false : state.player1BetMade,
    player2BetMade: shouldResetBetFlags ? false : state.player2BetMade,
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

/**
 * Check if the game is in a betting phase.
 */
function isBettingPhase(phase: GamePhase): boolean {
  return (
    phase === "bet1" ||
    phase === "bet2" ||
    phase === "bet3" ||
    phase === "finalBet"
  );
}

/**
 * Make a bet for a player.
 *
 * @param state - Current game state
 * @param playerId - ID of the player making the bet
 * @param amount - Number of coins to add to the pot (can be 0)
 * @returns Updated game state
 */
export function makeBet(
  state: GameState,
  playerId: string,
  amount: number
): GameState {
  // Validate phase
  if (!isBettingPhase(state.phase)) {
    throw new Error(`Cannot make bet in phase: ${state.phase}`);
  }

  // Both players must have matching moves before betting
  if (state.player1Moves.length !== state.player2Moves.length) {
    throw new Error("Cannot bet: moves not synchronized");
  }

  // Determine which player
  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  // Get player's perspective
  const ourCoins = isPlayer1 ? state.player1Coins : state.player2Coins;
  const theirCoins = isPlayer1 ? state.player2Coins : state.player1Coins;
  const ourPotCoins = isPlayer1 ? state.player1PotCoins : state.player2PotCoins;
  const theirPotCoins = isPlayer1 ? state.player2PotCoins : state.player1PotCoins;
  const ourBetMade = isPlayer1 ? state.player1BetMade : state.player2BetMade;

  // Check if already bet this round and bets match (no more betting allowed)
  if (
    state.player1BetMade &&
    state.player2BetMade &&
    state.player1PotCoins === state.player2PotCoins
  ) {
    throw new Error("Betting round already complete");
  }

  // Check if player already made their bet this betting round
  if (ourBetMade && ourPotCoins >= theirPotCoins) {
    throw new Error("Already placed bet this round");
  }

  // Validate bet amount
  if (amount < 0) {
    throw new Error("Bet amount cannot be negative");
  }

  if (amount > ourCoins) {
    throw new Error("Bet exceeds available coins");
  }

  // Bet cannot exceed opponent's total coins (to ensure they can match)
  if (amount + ourPotCoins > theirCoins + theirPotCoins) {
    throw new Error("Bet exceeds opponent's available coins");
  }

  // Apply the bet
  const newState = { ...state };

  if (isPlayer1) {
    newState.player1Coins = state.player1Coins - amount;
    newState.player1PotCoins = state.player1PotCoins + amount;
    newState.player1BetMade = true;
  } else {
    newState.player2Coins = state.player2Coins - amount;
    newState.player2PotCoins = state.player2PotCoins + amount;
    newState.player2BetMade = true;
  }

  // Update settled pot if bets now match
  if (
    newState.player1BetMade &&
    newState.player2BetMade &&
    newState.player1PotCoins === newState.player2PotCoins
  ) {
    newState.settledPotCoins = newState.player1PotCoins;
  }

  return tryTransition(newState);
}

/**
 * Fold the current betting round, forfeiting the pot to the opponent.
 *
 * @param state - Current game state
 * @param playerId - ID of the player folding
 * @returns Updated game state with pot distributed to opponent
 */
export function foldBet(state: GameState, playerId: string): GameState {
  // Validate phase
  if (!isBettingPhase(state.phase)) {
    throw new Error(`Cannot fold in phase: ${state.phase}`);
  }

  // Determine which player
  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  const ourPotCoins = isPlayer1 ? state.player1PotCoins : state.player2PotCoins;
  const theirPotCoins = isPlayer1 ? state.player2PotCoins : state.player1PotCoins;

  // Can only fold when opponent has more in pot (they raised)
  if (ourPotCoins >= theirPotCoins) {
    throw new Error("Cannot fold: you are not behind in the pot");
  }

  // Opponent wins the entire pot
  const totalPot = state.player1PotCoins + state.player2PotCoins;

  const newState: GameState = {
    ...state,
    player1PotCoins: 0,
    player2PotCoins: 0,
    settledPotCoins: 0,
    player1BetMade: false,
    player2BetMade: false,
    player1EndedRound: true,
    player2EndedRound: true,
    phase: "roundEnd",
  };

  // Give pot to the winner (opponent of folder)
  if (isPlayer1) {
    // Player 1 folded, player 2 wins
    newState.player2Coins = state.player2Coins + totalPot;
  } else {
    // Player 2 folded, player 1 wins
    newState.player1Coins = state.player1Coins + totalPot;
  }

  return newState;
}

/**
 * Signal that a player is ready to end the round.
 * When both players call this, the winner is computed and pot distributed.
 *
 * @param state - Current game state
 * @param playerId - ID of the player signaling end
 * @returns Updated game state
 */
export function endRound(state: GameState, playerId: string): GameState {
  // Can only end round after final betting when all moves complete
  if (state.phase !== "finalBet" && state.phase !== "roundEnd") {
    throw new Error(`Cannot end round in phase: ${state.phase}`);
  }

  // Must have all 7 moves from each player
  if (state.player1Moves.length !== 7 || state.player2Moves.length !== 7) {
    throw new Error("Cannot end round: moves not complete");
  }

  // Bets must be matched
  if (state.player1PotCoins !== state.player2PotCoins) {
    throw new Error("Cannot end round: bets not matched");
  }

  // Both must have made their final bet
  if (!state.player1BetMade || !state.player2BetMade) {
    throw new Error("Cannot end round: betting not complete");
  }

  // Determine which player
  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  // Check if already ended
  if (isPlayer1 && state.player1EndedRound) {
    throw new Error("Already signaled round end");
  }
  if (isPlayer2 && state.player2EndedRound) {
    throw new Error("Already signaled round end");
  }

  const newState = { ...state };

  if (isPlayer1) {
    newState.player1EndedRound = true;
  } else {
    newState.player2EndedRound = true;
  }

  // If both have ended, compute winner and distribute pot
  if (newState.player1EndedRound && newState.player2EndedRound) {
    const winner = determineWinner(
      state.board,
      state.player1Moves,
      state.player2Moves
    );

    const totalPot = state.player1PotCoins + state.player2PotCoins;

    if (winner === "player1") {
      newState.player1Coins = state.player1Coins + totalPot;
    } else if (winner === "player2") {
      newState.player2Coins = state.player2Coins + totalPot;
    } else {
      // Tie: each player gets their pot back
      newState.player1Coins = state.player1Coins + state.player1PotCoins;
      newState.player2Coins = state.player2Coins + state.player2PotCoins;
    }

    newState.player1PotCoins = 0;
    newState.player2PotCoins = 0;
    newState.settledPotCoins = 0;
    newState.phase = "roundEnd";
  }

  return newState;
}

/**
 * Start the next round of the game.
 * Generates a new board, resets moves, and collects ante.
 *
 * @param state - Current game state (must be in roundEnd phase)
 * @param seed - Optional seed for deterministic board generation
 * @returns Updated game state ready for move1
 */
export function startNextRound(state: GameState, seed?: number): GameState {
  // Can only start next round after round end
  if (state.phase !== "roundEnd") {
    throw new Error(`Cannot start next round in phase: ${state.phase}`);
  }

  // Both players must have ended the round
  if (!state.player1EndedRound || !state.player2EndedRound) {
    throw new Error("Both players must end round first");
  }

  // Check if game should end (someone out of coins)
  if (state.player1Coins <= 0 || state.player2Coins <= 0) {
    return {
      ...state,
      phase: "ended",
    };
  }

  // Generate new board
  const actualSeed = seed ?? Date.now();
  const newBoard = generateMagicSquare(actualSeed);

  // Calculate ante for next round
  const nextRoundNumber = state.roundNumber + 1;
  let anteCoins = getAnte(nextRoundNumber);

  // Ante shrinks if one player cannot afford it
  if (state.player1Coins < anteCoins) {
    anteCoins = state.player1Coins;
  }
  if (state.player2Coins < anteCoins) {
    anteCoins = state.player2Coins;
  }

  return {
    ...state,
    board: newBoard,
    phase: "move1",
    player1Moves: [],
    player2Moves: [],
    player1Coins: state.player1Coins - anteCoins,
    player2Coins: state.player2Coins - anteCoins,
    player1PotCoins: anteCoins,
    player2PotCoins: anteCoins,
    player1BetMade: true, // Ante counts as initial bet
    player2BetMade: true,
    settledPotCoins: anteCoins,
    player1EndedRound: false,
    player2EndedRound: false,
    roundNumber: nextRoundNumber,
  };
}

/**
 * Handle a player leaving the game mid-match.
 * The leaving player pays a penalty to the remaining player.
 *
 * @param state - Current game state
 * @param playerId - ID of the player leaving
 * @returns Updated game state with game ended
 */
export function leaveGame(state: GameState, playerId: string): GameState {
  // Can't leave a game that's already ended or waiting
  if (state.phase === "ended") {
    throw new Error("Game already ended");
  }

  if (state.phase === "waiting") {
    // No penalty for leaving before game starts
    return {
      ...state,
      phase: "ended",
    };
  }

  // Determine which player is leaving
  const isPlayer1 = state.player1.id === playerId;
  const isPlayer2 = state.player2?.id === playerId;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error("Player not in this game");
  }

  // Calculate penalty
  const penalty = getLeavePenalty(state.roundNumber);
  const totalPot = state.player1PotCoins + state.player2PotCoins;

  // Leaver loses their pot coins plus penalty from remaining coins
  // Remaining player gets the pot plus penalty
  let player1FinalCoins = state.player1Coins;
  let player2FinalCoins = state.player2Coins;

  if (isPlayer1) {
    // Player 1 is leaving
    const actualPenalty = Math.min(penalty, state.player1Coins);
    player1FinalCoins = state.player1Coins - actualPenalty;
    player2FinalCoins = state.player2Coins + totalPot + actualPenalty;
  } else {
    // Player 2 is leaving
    const actualPenalty = Math.min(penalty, state.player2Coins);
    player2FinalCoins = state.player2Coins - actualPenalty;
    player1FinalCoins = state.player1Coins + totalPot + actualPenalty;
  }

  return {
    ...state,
    phase: "ended",
    player1Coins: player1FinalCoins,
    player2Coins: player2FinalCoins,
    player1PotCoins: 0,
    player2PotCoins: 0,
    settledPotCoins: 0,
  };
}

/**
 * Check if the game has ended.
 *
 * @param state - Current game state
 * @returns true if the game is over
 */
export function isGameOver(state: GameState): boolean {
  return state.phase === "ended";
}

/**
 * Check if either player is out of coins (game should end after round).
 *
 * @param state - Current game state
 * @returns true if one player has no coins left
 */
export function shouldGameEnd(state: GameState): boolean {
  return state.player1Coins <= 0 || state.player2Coins <= 0;
}

/**
 * Get the winner of the game (only valid when game has ended).
 *
 * @param state - Current game state
 * @returns The winning player, or null if tie/game not ended
 */
export function getGameWinner(
  state: GameState
): "player1" | "player2" | "tie" | null {
  if (state.phase !== "ended") {
    return null;
  }

  if (state.player1Coins > state.player2Coins) {
    return "player1";
  } else if (state.player2Coins > state.player1Coins) {
    return "player2";
  } else {
    return "tie";
  }
}

