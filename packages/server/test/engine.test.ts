/**
 * Engine fixes: double actions, self-join, auto-end, leave on ended,
 * round results, abandonment.
 */

import { describe, expect, test, beforeAll } from "bun:test";
import {
  createGame,
  joinGame,
  makeMove,
  makeBet,
  foldBet,
  makeRevealMove,
  endRound,
  startNextRound,
  leaveGame,
  abandonGame,
  getPendingPlayers,
} from "../src/game/gameState";
import { setTurnTimeoutMs } from "../src/game/clock";
import { contractGameIdFor } from "../src/blockchain/gameId";
import { keccak256, stringToBytes } from "viem";
import {
  P1,
  P2,
  activeGame,
  playMoves,
  revealAndCheck,
  P1_WINS_MOVES,
  TIE_P1_MOVES,
  TIE_P2_MOVES,
} from "./helpers";

beforeAll(() => {
  setTurnTimeoutMs(120_000);
});

describe("createGame", () => {
  test("starts unfunded with the contract game id and no clock", () => {
    const game = createGame(P1, 5, 1);
    expect(game.escrowStatus).toBe("unfunded");
    expect(game.contractGameId).toBe(keccak256(stringToBytes(game.gameId)));
    expect(game.contractGameId).toBe(contractGameIdFor(game.gameId));
    expect(game.payoutTxHash).toBeNull();
    expect(game.player1Payout).toBeNull();
    expect(game.player2Payout).toBeNull();
    expect(game.settlementError).toBeNull();
    expect(game.phaseDeadline).toBeNull();
    expect(game.roundResult).toBeNull();
  });
});

describe("Self-join", () => {
  test("player 1 cannot join their own game", () => {
    const game = createGame(P1, 5, 1);
    expect(() => joinGame(game, { id: P1.id, name: "Alice again" })).toThrow(
      "Cannot join your own game"
    );
  });
});

describe("Double actions", () => {
  test("a second move in the same phase is rejected", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 0);
    expect(game.phase).toBe("move1");
    expect(() => makeMove(game, P1.id, 1, 1)).toThrow("Already moved this phase");
    expect(game.player1Moves).toEqual([0, 0]);

    // The other player can still move and the phase advances.
    game = makeMove(game, P2.id, 5, 5);
    expect(game.phase).toBe("bet1");
  });

  test("a second reveal is rejected", () => {
    let game = playMoves(activeGame(), P1_WINS_MOVES, P1_WINS_MOVES);
    expect(game.phase).toBe("reveal");
    game = makeRevealMove(game, P1.id, 0);
    expect(() => makeRevealMove(game, P1.id, 1)).toThrow("Already revealed this round");
    expect(game.player1Moves.length).toBe(7);
  });

  test("moves outside the board or non-integers are rejected", () => {
    const game = activeGame();
    expect(() => makeMove(game, P1.id, 6, 0)).toThrow("Move values must be between 0 and 5");
    expect(() => makeMove(game, P1.id, 1.5, 0)).toThrow("Move values must be between 0 and 5");
  });

  test("non-members get a 403-class error", () => {
    const game = activeGame();
    expect(() => makeMove(game, "stranger", 0, 0)).toThrow("Player not in this game");
    try {
      makeMove(game, "stranger", 0, 0);
    } catch (err) {
      expect((err as { status: number }).status).toBe(403);
    }
  });
});

describe("Round result", () => {
  test("showdown carries scores, winner, pot and byFold=false", () => {
    let game = playMoves(activeGame(), P1_WINS_MOVES, P1_WINS_MOVES, 3);
    game = revealAndCheck(game, 0, 0);
    expect(game.phase).toBe("roundEnd");
    expect(game.roundResult).toBeNull();

    // Pot: ante 1 + 3 × 3 = 10 per side, 20 total
    expect(game.player1PotCoins).toBe(10);
    expect(game.player2PotCoins).toBe(10);

    game = endRound(game, P1.id);
    expect(game.roundResult).toBeNull();
    game = endRound(game, P2.id);

    expect(game.phase).toBe("roundEnd");
    expect(game.roundResult).toEqual({
      roundNumber: 1,
      player1Score: 70,
      player2Score: 54,
      winner: "player1",
      potWon: 20,
      byFold: false,
    });
    expect(game.player1Coins).toBe(90 + 20);
    expect(game.player2Coins).toBe(90);
    expect(game.player1PotCoins).toBe(0);
    expect(game.player2PotCoins).toBe(0);
  });

  test("tie returns each pot and records potWon 0", () => {
    let game = playMoves(activeGame(), TIE_P1_MOVES, TIE_P2_MOVES, 2);
    game = revealAndCheck(game, 0, 5);
    game = endRound(game, P1.id);
    game = endRound(game, P2.id);

    expect(game.roundResult).toEqual({
      roundNumber: 1,
      player1Score: 66,
      player2Score: 66,
      winner: "tie",
      potWon: 0,
      byFold: false,
    });
    expect(game.player1Coins).toBe(100);
    expect(game.player2Coins).toBe(100);
  });

  test("fold records byFold, the opponent as winner and partial scores", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 3);
    game = makeMove(game, P2.id, 0, 3);
    game = makeBet(game, P1.id, 10);
    game = foldBet(game, P2.id);

    expect(game.phase).toBe("roundEnd");
    expect(game.player1EndedRound).toBe(true);
    expect(game.player2EndedRound).toBe(true);
    // Pot at fold: p1 ante 1 + 10, p2 ante 1 = 12
    expect(game.roundResult).toEqual({
      roundNumber: 1,
      player1Score: 7, // first pair only (see scoring.test.ts)
      player2Score: 27,
      winner: "player1",
      potWon: 12,
      byFold: true,
    });
    expect(game.player1Coins).toBe(89 + 12);
    expect(game.player2Coins).toBe(99);
  });

  test("the previous result stays visible during the next round", () => {
    let game = playMoves(activeGame(), P1_WINS_MOVES, P1_WINS_MOVES);
    game = revealAndCheck(game, 0, 0);
    game = endRound(game, P1.id);
    game = endRound(game, P2.id);
    const result = game.roundResult;
    game = startNextRound(game, 999);
    expect(game.phase).toBe("move1");
    expect(game.roundNumber).toBe(2);
    expect(game.roundResult).toEqual(result);
  });
});

describe("Auto game end", () => {
  test("a wipe-out at showdown ends the game without next-round", () => {
    let game = activeGame();
    // p1 goes all in at bet1 (99 coins on top of the ante), p2 calls.
    game = makeMove(game, P1.id, 0, 3);
    game = makeMove(game, P2.id, 0, 3);
    game = makeBet(game, P1.id, 99);
    game = makeBet(game, P2.id, 99);
    expect(game.phase).toBe("move2");
    expect(game.player1Coins).toBe(0);
    expect(game.player2Coins).toBe(0);

    for (let i = 1; i < 3; i++) {
      game = makeMove(game, P1.id, P1_WINS_MOVES[i * 2], P1_WINS_MOVES[i * 2 + 1]);
      game = makeMove(game, P2.id, P1_WINS_MOVES[i * 2], P1_WINS_MOVES[i * 2 + 1]);
      game = makeBet(game, P1.id, 0);
      game = makeBet(game, P2.id, 0);
    }
    game = revealAndCheck(game, 0, 0);
    game = endRound(game, P1.id);
    game = endRound(game, P2.id);

    expect(game.phase).toBe("ended");
    expect(game.phaseDeadline).toBeNull();
    expect(game.player1Coins).toBe(200);
    expect(game.player2Coins).toBe(0);
    expect(game.roundResult?.winner).toBe("player1");
    expect(game.roundResult?.potWon).toBe(200);
    expect(() => startNextRound(game)).toThrow("Cannot start next round in phase: ended");
  });

  test("startNextRound still ends a persisted roundEnd with a broke player", () => {
    let game = playMoves(activeGame(), P1_WINS_MOVES, P1_WINS_MOVES);
    game = revealAndCheck(game, 0, 0);
    game = endRound(game, P1.id);
    game = endRound(game, P2.id);
    game = startNextRound({ ...game, player2Coins: 0 });
    expect(game.phase).toBe("ended");
  });
});

describe("Leaving and abandoning", () => {
  test("leaving an ended game is a no-op", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 0);
    const ended = leaveGame(game, P2.id);
    expect(ended.phase).toBe("ended");
    // p2 pays the round-1 penalty of 6 and forfeits the pot of 2.
    expect(ended.player2Coins).toBe(99 - 6);
    expect(ended.player1Coins).toBe(99 + 2 + 6);

    const again = leaveGame(ended, P1.id);
    expect(again).toBe(ended);
    const andAgain = leaveGame(ended, P2.id);
    expect(andAgain).toBe(ended);
  });

  test("only the creator can leave a waiting game", () => {
    const game = createGame(P1, 5, 1);
    expect(() => leaveGame(game, P2.id)).toThrow("Player not in this game");
    expect(leaveGame(game, P1.id).phase).toBe("ended");
  });

  test("abandon returns pots to their owners and ends the game", () => {
    let game = activeGame();
    game = makeMove(game, P1.id, 0, 0);
    game = makeMove(game, P2.id, 0, 0);
    game = makeBet(game, P1.id, 7);
    // p1 has 1 + 7 = 8 in the pot, p2 has 1.
    const abandoned = abandonGame(game);
    expect(abandoned.phase).toBe("ended");
    expect(abandoned.player1Coins).toBe(100);
    expect(abandoned.player2Coins).toBe(100);
    expect(abandoned.player1PotCoins).toBe(0);
    expect(abandoned.player2PotCoins).toBe(0);
    expect(abandoned.phaseDeadline).toBeNull();
    expect(abandonGame(abandoned)).toBe(abandoned);
  });
});

describe("Pending players", () => {
  test("tracks who must act in every phase", () => {
    let game = createGame(P1, 5, 1);
    expect(getPendingPlayers(game)).toEqual([]);

    game = joinGame(game, P2);
    expect(getPendingPlayers(game)).toEqual(["player1", "player2"]);

    game = makeMove(game, P1.id, 0, 0);
    expect(getPendingPlayers(game)).toEqual(["player2"]);

    game = makeMove(game, P2.id, 0, 0);
    expect(game.phase).toBe("bet1");
    expect(getPendingPlayers(game)).toEqual(["player1", "player2"]);

    game = makeBet(game, P1.id, 5);
    expect(getPendingPlayers(game)).toEqual(["player2"]);

    game = makeBet(game, P2.id, 9); // raise
    expect(getPendingPlayers(game)).toEqual(["player1"]);

    game = makeBet(game, P1.id, 4); // call
    expect(game.phase).toBe("move2");

    game = playMoves(
      { ...game, player1Moves: [], player2Moves: [], phase: "move1" },
      P1_WINS_MOVES,
      P1_WINS_MOVES
    );
    expect(game.phase).toBe("reveal");
    game = makeRevealMove(game, P2.id, 0);
    expect(getPendingPlayers(game)).toEqual(["player1"]);
    game = makeRevealMove(game, P1.id, 0);
    expect(game.phase).toBe("finalBet");

    game = makeBet(game, P1.id, 0);
    game = makeBet(game, P2.id, 0);
    expect(game.phase).toBe("roundEnd");
    expect(getPendingPlayers(game)).toEqual(["player1", "player2"]);
    game = endRound(game, P2.id);
    expect(getPendingPlayers(game)).toEqual(["player1"]);
    game = endRound(game, P1.id);
    // Both confirmed: either may start the next round.
    expect(getPendingPlayers(game)).toEqual(["player1", "player2"]);

    game = leaveGame(game, P1.id);
    expect(getPendingPlayers(game)).toEqual([]);
  });
});
