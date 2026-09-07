/**
 * Masking rules of the single toGameStateView.
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { HIDDEN_MOVE } from "@civil-sarabande/shared";
import {
  createGame,
  makeMove,
  makeBet,
  foldBet,
  makeRevealMove,
  endRound,
} from "../src/game/gameState";
import { toGameStateView } from "../src/game/view";
import { setTurnTimeoutMs } from "../src/game/clock";
import { P1, P2, activeGame, playMoves, revealAndCheck, P1_WINS_MOVES } from "./helpers";

beforeAll(() => {
  setTurnTimeoutMs(120_000);
});

describe("toGameStateView", () => {
  test("rejects a viewer who is not in the game", () => {
    const game = activeGame();
    expect(() => toGameStateView(game, "stranger")).toThrow("Player not in this game");
  });

  test("truncates the opponent's moves to the committed length", () => {
    let game = activeGame();
    game = makeMove(game, P2.id, 4, 1);

    const p1 = toGameStateView(game, P1.id);
    expect(p1.yourMoves).toEqual([]);
    expect(p1.theirMoves).toEqual([]); // p1 must commit before seeing anything
    expect(p1.yourTurn).toBe(true);

    const p2 = toGameStateView(game, P2.id);
    expect(p2.yourMoves).toEqual([4, 1]);
    expect(p2.theirMoves).toEqual([]);
    expect(p2.yourTurn).toBe(false);
  });

  test("hides self-column choices and shows row assignments once committed", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 2, 3);
    game = makeMove(game, P2.id, 4, 1);
    expect(game.phase).toBe("bet1");

    const p1 = toGameStateView(game, P1.id);
    expect(p1.yourMoves).toEqual([2, 3]);
    expect(p1.theirMoves).toEqual([HIDDEN_MOVE, 1]);

    const p2 = toGameStateView(game, P2.id);
    expect(p2.yourMoves).toEqual([4, 1]);
    expect(p2.theirMoves).toEqual([HIDDEN_MOVE, 3]);
  });

  test("masks every even index through move3 and reveal", () => {
    let game = playMoves(activeGame(), [0, 3, 1, 4, 2, 5], [5, 0, 4, 1, 3, 2]);
    expect(game.phase).toBe("reveal");

    const p1 = toGameStateView(game, P1.id);
    expect(p1.theirMoves).toEqual([HIDDEN_MOVE, 0, HIDDEN_MOVE, 1, HIDDEN_MOVE, 2]);
    expect(p1.theirRevealedColumn).toBeNull();

    // One reveal in: still truncated to 6, nothing new leaks.
    game = makeRevealMove(game, P2.id, 4);
    const p1AfterTheirReveal = toGameStateView(game, P1.id);
    expect(p1AfterTheirReveal.theirMoves.length).toBe(6);
    expect(p1AfterTheirReveal.theirRevealedColumn).toBeNull();
    expect(p1AfterTheirReveal.yourTurn).toBe(true);
    expect(toGameStateView(game, P2.id).yourTurn).toBe(false);
  });

  test("shows index 6 and theirRevealedColumn once both have revealed", () => {
    let game = playMoves(activeGame(), [0, 3, 1, 4, 2, 5], [5, 0, 4, 1, 3, 2]);
    game = makeRevealMove(game, P1.id, 1);
    game = makeRevealMove(game, P2.id, 4);
    expect(game.phase).toBe("finalBet");

    const p1 = toGameStateView(game, P1.id);
    expect(p1.theirMoves).toEqual([HIDDEN_MOVE, 0, HIDDEN_MOVE, 1, HIDDEN_MOVE, 2, 4]);
    expect(p1.theirRevealedColumn).toBe(4);

    const p2 = toGameStateView(game, P2.id);
    expect(p2.theirMoves).toEqual([HIDDEN_MOVE, 3, HIDDEN_MOVE, 4, HIDDEN_MOVE, 5, 1]);
    expect(p2.theirRevealedColumn).toBe(1);
  });

  test("reveals everything at roundEnd and ended", () => {
    let game = playMoves(activeGame(), P1_WINS_MOVES, [5, 0, 4, 1, 3, 2]);
    game = revealAndCheck(game, 0, 5);
    expect(game.phase).toBe("roundEnd");

    const p1 = toGameStateView(game, P1.id);
    expect(p1.theirMoves).toEqual([5, 0, 4, 1, 3, 2, 5]);
    expect(p1.yourTurn).toBe(true);
    expect(p1.roundResult).toBeNull();

    game = endRound(game, P1.id);
    expect(toGameStateView(game, P1.id).yourTurn).toBe(false);
    expect(toGameStateView(game, P2.id).yourTurn).toBe(true);

    game = endRound(game, P2.id);
    const after = toGameStateView(game, P2.id);
    expect(after.theirMoves).toEqual([...P1_WINS_MOVES, 0]);
    expect(after.roundResult?.roundNumber).toBe(1);
    expect(after.yourTurn).toBe(true); // either player may start the next round
  });

  test("fold ends the round and unmasks the committed moves", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 2, 3);
    game = makeMove(game, P2.id, 4, 1);
    game = makeBet(game, P1.id, 5);
    game = foldBet(game, P2.id);

    const p1 = toGameStateView(game, P1.id);
    expect(p1.phase).toBe("roundEnd");
    expect(p1.theirMoves).toEqual([4, 1]);
    expect(p1.roundResult?.byFold).toBe(true);
    expect(p1.roundResult?.winner).toBe("player1");
  });

  test("yourTurn during betting follows the pending player", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 0);
    game = makeMove(game, P2.id, 0, 0);
    expect(toGameStateView(game, P1.id).yourTurn).toBe(true);
    expect(toGameStateView(game, P2.id).yourTurn).toBe(true);

    game = makeBet(game, P1.id, 5);
    expect(toGameStateView(game, P1.id).yourTurn).toBe(false);
    expect(toGameStateView(game, P2.id).yourTurn).toBe(true);

    game = makeBet(game, P2.id, 8);
    expect(toGameStateView(game, P1.id).yourTurn).toBe(true);
    expect(toGameStateView(game, P2.id).yourTurn).toBe(false);
  });

  test("carries the phase deadline and clears it when no clock runs", () => {
    const waiting = createGame(P1, 5, 1);
    expect(toGameStateView(waiting, P1.id).phaseDeadline).toBeNull();
    expect(toGameStateView(waiting, P1.id).yourTurn).toBe(false);

    const game = activeGame();
    const view = toGameStateView(game, P1.id);
    expect(view.phaseDeadline).not.toBeNull();
    expect(view.phaseDeadline! - Date.now()).toBeGreaterThan(100_000);
  });

  test("escrow view is role-specific", () => {
    const game = {
      ...activeGame(12345, 1.5),
      phase: "ended" as const,
      escrowStatus: "settled" as const,
      payoutTxHash: "0xabc",
      player1Payout: "3000000",
      player2Payout: "0",
      settlementError: null,
    };

    const p1 = toGameStateView(game, P1.id);
    expect(p1.escrow).toEqual({
      status: "settled",
      contractGameId: game.contractGameId,
      stakeUnits: "1500000",
      payoutTxHash: "0xabc",
      yourPayout: "3000000",
      theirPayout: "0",
      error: null,
    });

    const p2 = toGameStateView(game, P2.id);
    expect(p2.escrow.yourPayout).toBe("0");
    expect(p2.escrow.theirPayout).toBe("3000000");
    expect(p2.yourRole).toBe("player2");
    expect(p2.yourTurn).toBe(false);
  });

  test("a player 2 view mirrors the coin fields", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 0);
    game = makeMove(game, P2.id, 0, 0);
    game = makeBet(game, P1.id, 5);
    const p2 = toGameStateView(game, P2.id);
    expect(p2.yourCoins).toBe(99);
    expect(p2.theirCoins).toBe(94);
    expect(p2.yourPotCoins).toBe(1);
    expect(p2.theirPotCoins).toBe(6);
    expect(p2.yourBetMade).toBe(false);
    expect(p2.theirBetMade).toBe(true);
  });
});
