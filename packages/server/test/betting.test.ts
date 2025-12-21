/**
 * Tests for betting and round logic
 */

import { describe, expect, test } from "bun:test";
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
  isGameOver,
  shouldGameEnd,
  getGameWinner,
} from "../src/game/gameState";
import { GAME_CONSTANTS, getAnte } from "@civil-sarabande/shared";

const { STARTING_COINS } = GAME_CONSTANTS;

// Helper to create a game with two players ready for move1
function createActiveGame(seed = 12345) {
  const player1 = { id: "p1", name: "Player 1" };
  const player2 = { id: "p2", name: "Player 2" };
  const game = createGame(player1, 100, seed);
  return joinGame(game, player2);
}

// Helper to advance game through all 3 move phases
function playAllMoves(state: ReturnType<typeof createActiveGame>) {
  // Move 1
  let game = makeMove(state, "p1", 0, 0);
  game = makeMove(game, "p2", 5, 5);

  // Bet 1 (both bet 0 to pass through)
  game = makeBet(game, "p1", 0);
  game = makeBet(game, "p2", 0);

  // Move 2
  game = makeMove(game, "p1", 1, 1);
  game = makeMove(game, "p2", 4, 4);

  // Bet 2
  game = makeBet(game, "p1", 0);
  game = makeBet(game, "p2", 0);

  // Move 3
  game = makeMove(game, "p1", 2, 2);
  game = makeMove(game, "p2", 3, 3);

  // Bet 3
  game = makeBet(game, "p1", 0);
  game = makeBet(game, "p2", 0);

  return game;
}

// Helper to play through reveal and final bet
function playRevealPhase(state: ReturnType<typeof createActiveGame>) {
  // Both reveal their first column
  let game = makeRevealMove(state, "p1", 0);
  game = makeRevealMove(game, "p2", 5);

  // Final bet (both bet 0)
  game = makeBet(game, "p1", 0);
  game = makeBet(game, "p2", 0);

  return game;
}

describe("Game Creation and Joining", () => {
  test("createGame initializes new betting fields", () => {
    const player1 = { id: "p1", name: "Player 1" };
    const game = createGame(player1, 100, 12345);

    expect(game.player1BetMade).toBe(false);
    expect(game.player2BetMade).toBe(false);
    expect(game.settledPotCoins).toBe(0);
    expect(game.player1EndedRound).toBe(false);
    expect(game.player2EndedRound).toBe(false);
  });

  test("joinGame sets ante correctly", () => {
    const game = createActiveGame();

    const expectedAnte = getAnte(1); // Round 1
    expect(game.player1PotCoins).toBe(expectedAnte);
    expect(game.player2PotCoins).toBe(expectedAnte);
    expect(game.player1Coins).toBe(STARTING_COINS - expectedAnte);
    expect(game.player2Coins).toBe(STARTING_COINS - expectedAnte);
    expect(game.player1BetMade).toBe(true);
    expect(game.player2BetMade).toBe(true);
    expect(game.settledPotCoins).toBe(expectedAnte);
  });
});

describe("Betting", () => {
  test("makeBet adds coins to pot", () => {
    let game = createActiveGame();

    // Play move 1
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    expect(game.phase).toBe("bet1");

    const initialP1Coins = game.player1Coins;
    const initialP1PotCoins = game.player1PotCoins;

    game = makeBet(game, "p1", 5);

    expect(game.player1Coins).toBe(initialP1Coins - 5);
    expect(game.player1PotCoins).toBe(initialP1PotCoins + 5);
    expect(game.player1BetMade).toBe(true);
  });

  test("makeBet rejects bets exceeding available coins", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    expect(() => makeBet(game, "p1", game.player1Coins + 1)).toThrow(
      "Bet exceeds available coins"
    );
  });

  test("makeBet rejects bets exceeding opponent total coins", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    // Give P1 more coins so they can bet more than opponent
    game = { ...game, player1Coins: 200 };

    // Try to bet more than opponent could match
    const opponentTotal = game.player2Coins + game.player2PotCoins;
    const ourPot = game.player1PotCoins;

    expect(() =>
      makeBet(game, "p1", opponentTotal - ourPot + 1)
    ).toThrow("Bet exceeds opponent's available coins");
  });

  test("makeBet transitions to next move phase when bets match", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    expect(game.phase).toBe("bet1");

    game = makeBet(game, "p1", 5);
    game = makeBet(game, "p2", 5);

    expect(game.phase).toBe("move2");
    expect(game.player1PotCoins).toBe(game.player2PotCoins);
  });

  test("makeBet allows raise/call sequence", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    // P1 bets 5
    game = makeBet(game, "p1", 5);
    expect(game.player1BetMade).toBe(true);
    expect(game.player2BetMade).toBe(false);

    // P2 raises to 10
    game = makeBet(game, "p2", 10);
    expect(game.player2BetMade).toBe(true);
    // P1 needs to respond
    expect(game.phase).toBe("bet1");

    // P1 calls (matches the 10)
    game = makeBet(game, "p1", 5); // 5 more to match
    expect(game.phase).toBe("move2");
  });

  test("makeBet rejects bet outside betting phase", () => {
    const game = createActiveGame();
    expect(game.phase).toBe("move1");

    expect(() => makeBet(game, "p1", 5)).toThrow(
      "Cannot make bet in phase: move1"
    );
  });
});

describe("Folding", () => {
  test("foldBet gives pot to opponent", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    const p1CoinsBeforeBet = game.player1Coins;

    // P1 bets 10
    game = makeBet(game, "p1", 10);

    // Now total pot = P1's pot (ante + 10) + P2's pot (ante)
    const totalPotBeforeFold = game.player1PotCoins + game.player2PotCoins;

    // P2 folds instead of calling
    game = foldBet(game, "p2");

    expect(game.phase).toBe("roundEnd");
    expect(game.player1PotCoins).toBe(0);
    expect(game.player2PotCoins).toBe(0);
    // P1 wins the entire pot. P1's coins = (coins before bet) - 10 + totalPot
    expect(game.player1Coins).toBe(p1CoinsBeforeBet - 10 + totalPotBeforeFold);
  });

  test("foldBet rejects fold when not behind in pot", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    // Try to fold when pots are equal
    expect(() => foldBet(game, "p1")).toThrow(
      "Cannot fold: you are not behind in the pot"
    );
  });

  test("foldBet rejects fold when ahead in pot", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    // P1 bets 10
    game = makeBet(game, "p1", 10);

    // P1 can't fold - they're ahead
    expect(() => foldBet(game, "p1")).toThrow(
      "Cannot fold: you are not behind in the pot"
    );
  });
});

describe("Round End", () => {
  test("endRound requires both players to signal", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);

    // After playRevealPhase, we're now past finalBet (both bet 0 and matched)
    // So we should be ready for endRound
    expect(game.phase).toBe("roundEnd");

    // P1 ends
    game = endRound(game, "p1");
    expect(game.player1EndedRound).toBe(true);
    expect(game.player2EndedRound).toBe(false);
    // Still roundEnd until both signal
    expect(game.phase).toBe("roundEnd");

    // P2 ends - now pot is distributed
    game = endRound(game, "p2");
    expect(game.player1EndedRound).toBe(true);
    expect(game.player2EndedRound).toBe(true);
    expect(game.phase).toBe("roundEnd");
    // Pot should be distributed
    expect(game.player1PotCoins).toBe(0);
    expect(game.player2PotCoins).toBe(0);
  });

  test("endRound distributes pot to winner", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);

    const totalPot = game.player1PotCoins + game.player2PotCoins;
    const p1Before = game.player1Coins;
    const p2Before = game.player2Coins;

    game = endRound(game, "p1");
    game = endRound(game, "p2");

    // Total coins should be preserved
    expect(game.player1Coins + game.player2Coins).toBe(
      p1Before + p2Before + totalPot
    );
    expect(game.player1PotCoins).toBe(0);
    expect(game.player2PotCoins).toBe(0);
  });

  test("endRound rejects double end from same player", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);

    game = endRound(game, "p1");

    expect(() => endRound(game, "p1")).toThrow("Already signaled round end");
  });
});

describe("Next Round", () => {
  test("startNextRound generates new board and resets state", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);
    game = endRound(game, "p1");
    game = endRound(game, "p2");

    const oldBoard = game.board;

    game = startNextRound(game, 99999); // Different seed

    expect(game.phase).toBe("move1");
    expect(game.roundNumber).toBe(2);
    expect(game.player1Moves).toEqual([]);
    expect(game.player2Moves).toEqual([]);
    expect(game.board).not.toEqual(oldBoard);
    expect(game.player1EndedRound).toBe(false);
    expect(game.player2EndedRound).toBe(false);
  });

  test("startNextRound collects increased ante", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);
    game = endRound(game, "p1");
    game = endRound(game, "p2");

    const p1CoinsBefore = game.player1Coins;
    const p2CoinsBefore = game.player2Coins;

    game = startNextRound(game);

    const expectedAnte = getAnte(2); // Round 2
    expect(game.player1PotCoins).toBe(expectedAnte);
    expect(game.player2PotCoins).toBe(expectedAnte);
    expect(game.player1Coins).toBe(p1CoinsBefore - expectedAnte);
    expect(game.player2Coins).toBe(p2CoinsBefore - expectedAnte);
  });

  test("startNextRound ends game if player out of coins", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);
    game = endRound(game, "p1");
    game = endRound(game, "p2");

    // Artificially set player 1 to 0 coins
    game = { ...game, player1Coins: 0 };

    game = startNextRound(game);

    expect(game.phase).toBe("ended");
    expect(isGameOver(game)).toBe(true);
  });

  test("startNextRound shrinks ante if player can't afford full ante", () => {
    let game = createActiveGame();
    game = playAllMoves(game);
    game = playRevealPhase(game);
    game = endRound(game, "p1");
    game = endRound(game, "p2");

    // Set player 1 to only 1 coin (less than round 2 ante of 2)
    game = { ...game, player1Coins: 1 };

    game = startNextRound(game);

    // Ante should shrink to what P1 can afford
    expect(game.player1PotCoins).toBe(1);
    expect(game.player2PotCoins).toBe(1);
    expect(game.player1Coins).toBe(0);
  });
});

describe("Leave Game", () => {
  test("leaveGame ends the game with penalty", () => {
    let game = createActiveGame();
    game = makeMove(game, "p1", 0, 0);
    game = makeMove(game, "p2", 5, 5);

    const p2CoinsBefore = game.player2Coins;
    const totalPot = game.player1PotCoins + game.player2PotCoins;

    game = leaveGame(game, "p1");

    expect(game.phase).toBe("ended");
    expect(isGameOver(game)).toBe(true);
    // P2 should get pot plus penalty
    expect(game.player2Coins).toBeGreaterThan(p2CoinsBefore + totalPot);
  });

  test("leaveGame in waiting phase has no penalty", () => {
    const player1 = { id: "p1", name: "Player 1" };
    let game = createGame(player1, 100, 12345);

    game = leaveGame(game, "p1");

    expect(game.phase).toBe("ended");
    expect(game.player1Coins).toBe(STARTING_COINS);
  });
});

describe("Game End Detection", () => {
  test("isGameOver returns true for ended games", () => {
    const game = createActiveGame();
    expect(isGameOver(game)).toBe(false);

    const endedGame = { ...game, phase: "ended" as const };
    expect(isGameOver(endedGame)).toBe(true);
  });

  test("shouldGameEnd detects player out of coins", () => {
    const game = createActiveGame();
    expect(shouldGameEnd(game)).toBe(false);

    const brokeGame = { ...game, player1Coins: 0 };
    expect(shouldGameEnd(brokeGame)).toBe(true);
  });

  test("getGameWinner returns correct winner", () => {
    const game = createActiveGame();
    expect(getGameWinner(game)).toBe(null); // Game not ended

    const endedP1Wins = {
      ...game,
      phase: "ended" as const,
      player1Coins: 150,
      player2Coins: 50,
    };
    expect(getGameWinner(endedP1Wins)).toBe("player1");

    const endedP2Wins = {
      ...game,
      phase: "ended" as const,
      player1Coins: 50,
      player2Coins: 150,
    };
    expect(getGameWinner(endedP2Wins)).toBe("player2");

    const endedTie = {
      ...game,
      phase: "ended" as const,
      player1Coins: 100,
      player2Coins: 100,
    };
    expect(getGameWinner(endedTie)).toBe("tie");
  });
});

