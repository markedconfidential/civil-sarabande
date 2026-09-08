/**
 * Game State Management
 *
 * Pure state machine for a game. Every function takes a GameState and
 * returns a new one (or throws a GameError). Persistence, chain access and
 * notifications live in the store.
 *
 * Reference: reference/server/protocol.txt for the game flow
 */

import {
  type GameState,
  type GamePhase,
  type Player,
  type RoundResult,
  GAME_CONSTANTS,
  getAnte,
  getLeavePenalty,
} from "@civil-sarabande/shared";
import { generateMagicSquare } from "./magicSquare";
import { computeScores } from "./scoring";
import { contractGameIdFor } from "../blockchain/gameId";
import { GameError, ForbiddenError } from "./errors";
import { nextDeadline } from "./clock";

const { STARTING_COINS, BOARD_SIZE, MOVES_PER_ROUND } = GAME_CONSTANTS;

export type PlayerRole = "player1" | "player2";

/**
 * Generate a unique game ID.
 */
function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Which side of the table a player id sits on, or null if not in the game. */
export function getPlayerRole(state: GameState, playerId: string): PlayerRole | null {
  if (state.player1.id === playerId) return "player1";
  if (state.player2?.id === playerId) return "player2";
  return null;
}

function requireRole(state: GameState, playerId: string): PlayerRole {
  const role = getPlayerRole(state, playerId);
  if (!role) throw new ForbiddenError();
  return role;
}

/**
 * Create a new game in the waiting state.
 *
 * @param player1 - The player creating the game
 * @param stake - Stake per player in USDC
 * @param seed - Optional seed for deterministic board generation
 */
export function createGame(player1: Player, stake: number, seed?: number): GameState {
  const actualSeed = seed ?? Date.now();
  const board = generateMagicSquare(actualSeed);
  const gameId = generateGameId();

  return {
    gameId,
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

    escrowStatus: "unfunded",
    contractGameId: contractGameIdFor(gameId),
    payoutTxHash: null,
    player1Payout: null,
    player2Payout: null,
    settlementError: null,

    phaseDeadline: null,
    roundResult: null,
  };
}

// ============================================================================
// Deadlines and pending players
// ============================================================================

/** Number of the move phase (move1 → 1), or 0 for other phases. */
function movePhaseNumber(phase: GamePhase): number {
  return phase.startsWith("move") ? parseInt(phase.slice(-1), 10) : 0;
}

function isBettingPhase(phase: GamePhase): boolean {
  return phase === "bet1" || phase === "bet2" || phase === "bet3" || phase === "finalBet";
}

/**
 * The players who must act before the phase can advance.
 *
 * - move phases: whoever has fewer than phaseNumber × 2 moves
 * - betting phases: whoever has not bet, or is behind in the pot
 * - reveal: whoever has fewer than 7 moves
 * - roundEnd: whoever has not confirmed; once both have, either may start
 *   the next round, so both are pending
 * - waiting / ended: nobody
 */
export function getPendingPlayers(state: GameState): PlayerRole[] {
  const pending: PlayerRole[] = [];
  const { phase } = state;

  if (phase === "waiting" || phase === "ended") return pending;

  const moveNumber = movePhaseNumber(phase);
  if (moveNumber > 0) {
    const expected = moveNumber * 2;
    if (state.player1Moves.length < expected) pending.push("player1");
    if (state.player2Moves.length < expected) pending.push("player2");
    return pending;
  }

  if (phase === "reveal") {
    if (state.player1Moves.length < 7) pending.push("player1");
    if (state.player2Moves.length < 7) pending.push("player2");
    return pending;
  }

  if (isBettingPhase(phase)) {
    if (!state.player1BetMade || state.player1PotCoins < state.player2PotCoins) {
      pending.push("player1");
    }
    if (!state.player2BetMade || state.player2PotCoins < state.player1PotCoins) {
      pending.push("player2");
    }
    return pending;
  }

  if (phase === "roundEnd") {
    if (state.player1EndedRound && state.player2EndedRound) {
      return ["player1", "player2"];
    }
    if (!state.player1EndedRound) pending.push("player1");
    if (!state.player2EndedRound) pending.push("player2");
    return pending;
  }

  return pending;
}

/**
 * Stamp a fresh deadline on a state that has just changed. Called after
 * every successful action: either the phase changed, or one player's action
 * left the other to act, and in both cases the clock restarts. Waiting and
 * ended games carry no deadline.
 */
export function withDeadline(state: GameState): GameState {
  const phaseDeadline =
    state.phase === "waiting" || state.phase === "ended" ? null : nextDeadline();
  return { ...state, phaseDeadline };
}

// ============================================================================
// Joining
// ============================================================================

/**
 * Join an existing game as player 2.
 *
 * @param state - Current game state (must be in 'waiting' phase)
 * @param player2 - The player joining the game
 */
export function joinGame(state: GameState, player2: Player): GameState {
  if (state.phase !== "waiting") {
    throw new GameError(`Cannot join game in phase: ${state.phase}`);
  }

  if (state.player2 !== null) {
    throw new GameError("Game already has two players");
  }

  if (state.player1.id === player2.id) {
    throw new GameError("Cannot join your own game");
  }

  // Start with the first ante
  const anteCoins = getAnte(state.roundNumber);

  return withDeadline({
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
  });
}

// ============================================================================
// Phase transitions
// ============================================================================

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
      const expectedMoves = movePhaseNumber(phase) * 2;
      return player1Moves.length >= expectedMoves && player2Moves.length >= expectedMoves;
    }

    case "bet1":
    case "bet2":
    case "bet3":
    case "finalBet": {
      return player1BetMade && player2BetMade && player1PotCoins === player2PotCoins;
    }

    case "reveal": {
      return player1Moves.length >= 7 && player2Moves.length >= 7;
    }

    default:
      return false;
  }
}

/**
 * Transition to the next phase if ready.
 */
export function tryTransition(state: GameState): GameState {
  if (!isReadyForNextPhase(state)) {
    return state;
  }

  const nextPhase = getNextPhase(state.phase);

  const isMovePhase = state.phase.startsWith("move") || state.phase === "reveal";
  const isNextBettingPhase = nextPhase.startsWith("bet") || nextPhase === "finalBet";

  // Entering a betting phase lets both players bet again.
  const shouldResetBetFlags = isMovePhase && isNextBettingPhase;

  return {
    ...state,
    phase: nextPhase,
    player1BetMade: shouldResetBetFlags ? false : state.player1BetMade,
    player2BetMade: shouldResetBetFlags ? false : state.player2BetMade,
  };
}

// ============================================================================
// Moves
// ============================================================================

/**
 * Make a move for a player.
 *
 * @param selfColumn - Column the player chooses for themselves (0-5)
 * @param otherRow - Row the player assigns to their opponent (0-5)
 */
export function makeMove(
  state: GameState,
  playerId: string,
  selfColumn: number,
  otherRow: number
): GameState {
  const moveNumber = movePhaseNumber(state.phase);
  if (moveNumber === 0) {
    throw new GameError(`Cannot make move in phase: ${state.phase}`);
  }

  if (
    !Number.isInteger(selfColumn) ||
    !Number.isInteger(otherRow) ||
    selfColumn < 0 ||
    selfColumn > BOARD_SIZE - 1 ||
    otherRow < 0 ||
    otherRow > BOARD_SIZE - 1
  ) {
    throw new GameError("Move values must be between 0 and 5");
  }

  const role = requireRole(state, playerId);
  const ownMoves = role === "player1" ? state.player1Moves : state.player2Moves;

  // A player gets exactly one move per move phase.
  if (ownMoves.length >= moveNumber * 2) {
    throw new GameError("Already moved this phase");
  }

  const newState = { ...state };
  if (role === "player1") {
    newState.player1Moves = [...state.player1Moves, selfColumn, otherRow];
  } else {
    newState.player2Moves = [...state.player2Moves, selfColumn, otherRow];
  }

  return withDeadline(tryTransition(newState));
}

/**
 * Make a reveal move for a player.
 *
 * @param revealColumn - Which of their 3 columns to reveal (must be one they chose)
 */
export function makeRevealMove(
  state: GameState,
  playerId: string,
  revealColumn: number
): GameState {
  if (state.phase !== "reveal") {
    throw new GameError(`Cannot make reveal move in phase: ${state.phase}`);
  }

  const role = requireRole(state, playerId);
  const playerMoves = role === "player1" ? state.player1Moves : state.player2Moves;

  if (playerMoves.length >= 7) {
    throw new GameError("Already revealed this round");
  }

  const chosenColumns = [playerMoves[0], playerMoves[2], playerMoves[4]];
  if (!chosenColumns.includes(revealColumn)) {
    throw new GameError("Reveal column must be one of your chosen columns");
  }

  const newState = { ...state };
  if (role === "player1") {
    newState.player1Moves = [...state.player1Moves, revealColumn];
  } else {
    newState.player2Moves = [...state.player2Moves, revealColumn];
  }

  return withDeadline(tryTransition(newState));
}

// ============================================================================
// Betting
// ============================================================================

/**
 * Make a bet for a player.
 *
 * @param amount - Number of coins to add to the pot (can be 0)
 */
export function makeBet(state: GameState, playerId: string, amount: number): GameState {
  if (!isBettingPhase(state.phase)) {
    throw new GameError(`Cannot make bet in phase: ${state.phase}`);
  }

  if (state.player1Moves.length !== state.player2Moves.length) {
    throw new GameError("Cannot bet: moves not synchronized");
  }

  const role = requireRole(state, playerId);
  const isPlayer1 = role === "player1";

  const ourCoins = isPlayer1 ? state.player1Coins : state.player2Coins;
  const theirCoins = isPlayer1 ? state.player2Coins : state.player1Coins;
  const ourPotCoins = isPlayer1 ? state.player1PotCoins : state.player2PotCoins;
  const theirPotCoins = isPlayer1 ? state.player2PotCoins : state.player1PotCoins;
  const ourBetMade = isPlayer1 ? state.player1BetMade : state.player2BetMade;

  if (
    state.player1BetMade &&
    state.player2BetMade &&
    state.player1PotCoins === state.player2PotCoins
  ) {
    throw new GameError("Betting round already complete");
  }

  if (ourBetMade && ourPotCoins >= theirPotCoins) {
    throw new GameError("Already placed bet this round");
  }

  if (!Number.isInteger(amount)) {
    throw new GameError("Bet amount must be a whole number of coins");
  }

  if (amount < 0) {
    throw new GameError("Bet amount cannot be negative");
  }

  if (amount > ourCoins) {
    throw new GameError("Bet exceeds available coins");
  }

  // Bet cannot exceed opponent's total coins (to ensure they can match)
  if (amount + ourPotCoins > theirCoins + theirPotCoins) {
    throw new GameError("Bet exceeds opponent's available coins");
  }

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

  if (
    newState.player1BetMade &&
    newState.player2BetMade &&
    newState.player1PotCoins === newState.player2PotCoins
  ) {
    newState.settledPotCoins = newState.player1PotCoins;
  }

  return withDeadline(tryTransition(newState));
}

// ============================================================================
// Round resolution
// ============================================================================

/**
 * Scores over the move pairs both players have completed. At a showdown this
 * is the full three-cell score; after a fold it is the partial score of the
 * cells committed so far (0 if the fold came before any move pair).
 */
function partialScores(state: GameState): { player1Score: number; player2Score: number } {
  const pairs = Math.min(
    Math.floor(state.player1Moves.length / 2),
    Math.floor(state.player2Moves.length / 2),
    MOVES_PER_ROUND
  );
  if (pairs === MOVES_PER_ROUND) {
    const { p1Score, p2Score } = computeScores(state.board, state.player1Moves, state.player2Moves);
    return { player1Score: p1Score, player2Score: p2Score };
  }
  const { p1Score, p2Score } = computeScores(
    state.board,
    state.player1Moves.slice(0, pairs * 2),
    state.player2Moves.slice(0, pairs * 2),
    pairs
  );
  return { player1Score: p1Score, player2Score: p2Score };
}

/**
 * Finish the round: hand the pot to `winner` (or return it on a tie), record
 * the round result, and end the game if either player is out of coins.
 */
function resolveRound(
  state: GameState,
  winner: "player1" | "player2" | "tie",
  byFold: boolean
): GameState {
  const totalPot = state.player1PotCoins + state.player2PotCoins;
  const { player1Score, player2Score } = partialScores(state);

  let player1Coins = state.player1Coins;
  let player2Coins = state.player2Coins;

  if (winner === "player1") {
    player1Coins += totalPot;
  } else if (winner === "player2") {
    player2Coins += totalPot;
  } else {
    player1Coins += state.player1PotCoins;
    player2Coins += state.player2PotCoins;
  }

  const roundResult: RoundResult = {
    roundNumber: state.roundNumber,
    player1Score,
    player2Score,
    winner,
    potWon: winner === "tie" ? 0 : totalPot,
    byFold,
  };

  const wipedOut = player1Coins <= 0 || player2Coins <= 0;

  return withDeadline({
    ...state,
    player1Coins,
    player2Coins,
    player1PotCoins: 0,
    player2PotCoins: 0,
    settledPotCoins: 0,
    player1BetMade: false,
    player2BetMade: false,
    player1EndedRound: true,
    player2EndedRound: true,
    roundResult,
    phase: wipedOut ? "ended" : "roundEnd",
  });
}

/**
 * Fold the current betting round, forfeiting the pot to the opponent.
 */
export function foldBet(state: GameState, playerId: string): GameState {
  if (!isBettingPhase(state.phase)) {
    throw new GameError(`Cannot fold in phase: ${state.phase}`);
  }

  const role = requireRole(state, playerId);
  const isPlayer1 = role === "player1";

  const ourPotCoins = isPlayer1 ? state.player1PotCoins : state.player2PotCoins;
  const theirPotCoins = isPlayer1 ? state.player2PotCoins : state.player1PotCoins;

  // Can only fold when opponent has more in pot (they raised)
  if (ourPotCoins >= theirPotCoins) {
    throw new GameError("Cannot fold: you are not behind in the pot");
  }

  return resolveRound(state, isPlayer1 ? "player2" : "player1", true);
}

/**
 * Signal that a player is ready to end the round.
 * When both players have signalled, the winner is computed and the pot distributed.
 */
export function endRound(state: GameState, playerId: string): GameState {
  if (state.phase !== "finalBet" && state.phase !== "roundEnd") {
    throw new GameError(`Cannot end round in phase: ${state.phase}`);
  }

  if (state.player1Moves.length !== 7 || state.player2Moves.length !== 7) {
    throw new GameError("Cannot end round: moves not complete");
  }

  if (state.player1PotCoins !== state.player2PotCoins) {
    throw new GameError("Cannot end round: bets not matched");
  }

  if (!state.player1BetMade || !state.player2BetMade) {
    throw new GameError("Cannot end round: betting not complete");
  }

  const role = requireRole(state, playerId);

  if (role === "player1" && state.player1EndedRound) {
    throw new GameError("Already signaled round end");
  }
  if (role === "player2" && state.player2EndedRound) {
    throw new GameError("Already signaled round end");
  }

  const newState = { ...state };
  if (role === "player1") {
    newState.player1EndedRound = true;
  } else {
    newState.player2EndedRound = true;
  }

  if (newState.player1EndedRound && newState.player2EndedRound) {
    const { player1Score, player2Score } = partialScores(state);
    const winner =
      player1Score > player2Score ? "player1" : player2Score > player1Score ? "player2" : "tie";
    return resolveRound(newState, winner, false);
  }

  return withDeadline(newState);
}

/**
 * Start the next round of the game.
 * Generates a new board, resets moves, and collects the ante.
 */
export function startNextRound(state: GameState, seed?: number): GameState {
  if (state.phase !== "roundEnd") {
    throw new GameError(`Cannot start next round in phase: ${state.phase}`);
  }

  if (!state.player1EndedRound || !state.player2EndedRound) {
    throw new GameError("Both players must end round first");
  }

  // Safety net: a round that left someone broke already ended the game in
  // resolveRound, but a persisted roundEnd state may predate that rule.
  if (state.player1Coins <= 0 || state.player2Coins <= 0) {
    return withDeadline({ ...state, phase: "ended" });
  }

  const actualSeed = seed ?? Date.now();
  const newBoard = generateMagicSquare(actualSeed);

  const nextRoundNumber = state.roundNumber + 1;
  let anteCoins = getAnte(nextRoundNumber);

  // Ante shrinks if one player cannot afford it
  if (state.player1Coins < anteCoins) {
    anteCoins = state.player1Coins;
  }
  if (state.player2Coins < anteCoins) {
    anteCoins = state.player2Coins;
  }

  return withDeadline({
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
  });
}

// ============================================================================
// Leaving, abandoning
// ============================================================================

/**
 * Handle a player leaving the game mid-match.
 * The leaver forfeits the pot and pays a penalty to the remaining player.
 * Leaving an ended game is a no-op.
 */
export function leaveGame(state: GameState, playerId: string): GameState {
  if (state.phase === "ended") {
    return state;
  }

  if (state.phase === "waiting") {
    if (state.player1.id !== playerId) throw new ForbiddenError();
    // No penalty for leaving before game starts
    return withDeadline({ ...state, phase: "ended" });
  }

  const role = requireRole(state, playerId);

  const penalty = getLeavePenalty(state.roundNumber);
  const totalPot = state.player1PotCoins + state.player2PotCoins;

  let player1FinalCoins = state.player1Coins;
  let player2FinalCoins = state.player2Coins;

  if (role === "player1") {
    const actualPenalty = Math.min(penalty, state.player1Coins);
    player1FinalCoins = state.player1Coins - actualPenalty;
    player2FinalCoins = state.player2Coins + totalPot + actualPenalty;
  } else {
    const actualPenalty = Math.min(penalty, state.player2Coins);
    player2FinalCoins = state.player2Coins - actualPenalty;
    player1FinalCoins = state.player1Coins + totalPot + actualPenalty;
  }

  return withDeadline({
    ...state,
    phase: "ended",
    player1Coins: player1FinalCoins,
    player2Coins: player2FinalCoins,
    player1PotCoins: 0,
    player2PotCoins: 0,
    settledPotCoins: 0,
  });
}

/**
 * Abandon a game both players walked away from: every coin in the pot goes
 * back to whoever put it there and the game ends with no penalty.
 */
export function abandonGame(state: GameState): GameState {
  if (state.phase === "ended") {
    return state;
  }

  return withDeadline({
    ...state,
    phase: "ended",
    player1Coins: state.player1Coins + state.player1PotCoins,
    player2Coins: state.player2Coins + state.player2PotCoins,
    player1PotCoins: 0,
    player2PotCoins: 0,
    settledPotCoins: 0,
  });
}

// ============================================================================
// Queries
// ============================================================================

export function isGameOver(state: GameState): boolean {
  return state.phase === "ended";
}

/**
 * Check if either player is out of coins (game should end after round).
 */
export function shouldGameEnd(state: GameState): boolean {
  return state.player1Coins <= 0 || state.player2Coins <= 0;
}

/**
 * Get the winner of the game (only valid when game has ended).
 */
export function getGameWinner(state: GameState): "player1" | "player2" | "tie" | null {
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
