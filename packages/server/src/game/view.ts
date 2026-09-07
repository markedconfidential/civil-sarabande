/**
 * Player-specific view of a game.
 *
 * This is the single place where the internal GameState is projected for one
 * player. Hidden information is masked here and nowhere else:
 *
 * - `theirMoves` is truncated to the committed length (the shorter of the
 *   two move lists), so you never see the row you were assigned before you
 *   commit your own move for that phase.
 * - Within that prefix, the opponent's self-column choices (even indices
 *   0, 2, 4) are HIDDEN_MOVE until the phase is roundEnd or ended.
 * - Row assignments (odd indices 1, 3, 5) are visible once committed.
 * - Index 6 (their reveal) is present only once both players have revealed
 *   (truncation guarantees this) and is always visible then.
 * - `theirRevealedColumn` is their index-6 value once both have revealed,
 *   in the opponent's own coordinates (player 2's moves are mirrored).
 */

import {
  HIDDEN_MOVE,
  usdcToUnits,
  type EscrowView,
  type GameState,
  type GameStateView,
  type MoveList,
} from "@civil-sarabande/shared";
import { getPendingPlayers, getPlayerRole } from "./gameState";
import { ForbiddenError } from "./errors";

/** True when the round is over and every move of the round is public. */
function movesArePublic(game: GameState): boolean {
  return game.phase === "roundEnd" || game.phase === "ended";
}

/** Mask the opponent's move list for the viewer. */
export function maskOpponentMoves(game: GameState, theirFullMoves: MoveList): MoveList {
  const committedLength = Math.min(game.player1Moves.length, game.player2Moves.length);
  const visible = theirFullMoves.slice(0, committedLength);
  if (movesArePublic(game)) return visible;

  return visible.map((value, index) =>
    index % 2 === 0 && index < 6 ? HIDDEN_MOVE : value
  );
}

function escrowView(game: GameState, isPlayer1: boolean): EscrowView {
  return {
    status: game.escrowStatus,
    contractGameId: game.contractGameId,
    stakeUnits: usdcToUnits(game.stake).toString(),
    payoutTxHash: game.payoutTxHash,
    yourPayout: isPlayer1 ? game.player1Payout : game.player2Payout,
    theirPayout: isPlayer1 ? game.player2Payout : game.player1Payout,
    error: game.settlementError,
  };
}

/**
 * Convert internal GameState to the view for `playerId`.
 * Throws ForbiddenError if the player is not in the game.
 */
export function toGameStateView(game: GameState, playerId: string): GameStateView {
  const role = getPlayerRole(game, playerId);
  if (!role) throw new ForbiddenError();
  const isPlayer1 = role === "player1";

  const yourMoves = isPlayer1 ? game.player1Moves : game.player2Moves;
  const theirFullMoves = isPlayer1 ? game.player2Moves : game.player1Moves;
  const theirMoves = maskOpponentMoves(game, theirFullMoves);

  const bothRevealed = game.player1Moves.length >= 7 && game.player2Moves.length >= 7;
  const theirRevealedColumn = bothRevealed ? theirFullMoves[6] : null;

  const pending = getPendingPlayers(game);

  return {
    gameId: game.gameId,
    board: game.board,
    phase: game.phase,
    player1: game.player1,
    player2: game.player2,
    roundNumber: game.roundNumber,
    stake: game.stake,
    createdAt: game.createdAt,

    yourCoins: isPlayer1 ? game.player1Coins : game.player2Coins,
    theirCoins: isPlayer1 ? game.player2Coins : game.player1Coins,
    yourPotCoins: isPlayer1 ? game.player1PotCoins : game.player2PotCoins,
    theirPotCoins: isPlayer1 ? game.player2PotCoins : game.player1PotCoins,

    yourBetMade: isPlayer1 ? game.player1BetMade : game.player2BetMade,
    theirBetMade: isPlayer1 ? game.player2BetMade : game.player1BetMade,
    settledPotCoins: game.settledPotCoins,

    yourEndedRound: isPlayer1 ? game.player1EndedRound : game.player2EndedRound,
    theirEndedRound: isPlayer1 ? game.player2EndedRound : game.player1EndedRound,

    yourMoves: [...yourMoves],
    theirMoves,
    theirRevealedColumn,

    yourRole: role,

    phaseDeadline: game.phaseDeadline,
    yourTurn: pending.includes(role),
    roundResult: game.roundResult,

    escrow: escrowView(game, isPlayer1),
  };
}
