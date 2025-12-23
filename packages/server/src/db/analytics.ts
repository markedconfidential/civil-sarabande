/**
 * Analytics Calculation
 * 
 * Helper functions to calculate game analytics data.
 */

import type { GameState } from "@civil-sarabande/shared";
import { GAME_CONSTANTS } from "@civil-sarabande/shared";
import { getGameWinner } from "../game/gameState";
import type { GameHistoryRecord } from "./gameHistoryRepository";

/**
 * Calculate analytics for a completed game.
 */
export function calculateGameAnalytics(
  game: GameState,
  startedAt: number,
  endedAt: number,
  whoLeft?: "player1" | "player2"
): GameHistoryRecord {
  const durationSeconds = Math.floor((endedAt - startedAt) / 1000);
  
  // Determine winner and loser
  let winner: "player1" | "player2" | "tie" | null = null;
  let loser: "player1" | "player2" | null = null;
  
  // If someone left, they're the loser
  if (whoLeft) {
    loser = whoLeft;
    // If game never started (no player2), there's no winner
    if (game.player2) {
      winner = whoLeft === "player1" ? "player2" : "player1";
    }
  } else if (game.phase === "ended" && game.player2) {
    // Game ended naturally with both players
    const gameWinner = getGameWinner(game);
    if (gameWinner === "player1") {
      winner = "player1";
      loser = "player2";
    } else if (gameWinner === "player2") {
      winner = "player2";
      loser = "player1";
    } else if (gameWinner === "tie") {
      winner = "tie";
      loser = null; // No loser in a tie
    }
  }
  
  // Calculate net change in coins
  const player1StartingCoins = GAME_CONSTANTS.STARTING_COINS;
  const player2StartingCoins = game.player2 ? GAME_CONSTANTS.STARTING_COINS : 0;
  const player1EndingCoins = game.player1Coins;
  const player2EndingCoins = game.player2 ? game.player2Coins : 0;
  const player1NetChange = player1EndingCoins - player1StartingCoins;
  const player2NetChange = game.player2 ? player2EndingCoins - player2StartingCoins : 0;
  
  return {
    gameId: game.gameId,
    player1Id: game.player1.id,
    player1Name: game.player1.name,
    player2Id: game.player2?.id,
    player2Name: game.player2?.name,
    startedAt,
    endedAt,
    durationSeconds,
    winner,
    loser,
    player1StartingCoins,
    player2StartingCoins,
    player1EndingCoins,
    player2EndingCoins,
    player1NetChange,
    player2NetChange,
    whoLeft: whoLeft || null,
    stake: game.stake,
    finalRoundNumber: game.roundNumber,
    createdAt: Date.now(),
  };
}

