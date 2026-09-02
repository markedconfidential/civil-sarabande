/**
 * Contract API Routes
 *
 * Endpoints for blockchain contract interactions.
 */

import { requireAuth } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";
import * as gameRepo from "../db/gameRepository";
import {
  getGameIdFromServerId,
  prepareCreateGameTransaction,
  prepareJoinGameTransaction,
  prepareDepositBetTransaction,
  payoutWinner,
  cancelGame,
} from "../blockchain/contractService";
import { getServerWalletAddress } from "../blockchain/walletService";
import type { Address } from "viem";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/contractRoutes");

function errorResponse(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * POST /contracts/game/:id/prepare-create - Prepare createGame transaction
 * Returns transaction data for frontend to sign and send
 */
export async function handlePrepareCreateGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = pathname.substring("/contracts/game/".length).replace("/prepare-create", "");
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    // Get game from database
    const db = getDatabase();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      return errorResponse("Game not found", 404);
    }

    // Verify player is player1
    if (game.player1.id !== userId) {
      return errorResponse("Only game creator can prepare create transaction", 403);
    }

    // Check if contract game already exists
    if (gameRepo.getContractGameId(db, gameId)) {
      return errorResponse("Game already has contract transaction", 400);
    }

    // Prepare transaction
    const txData = prepareCreateGameTransaction(gameId, game.stake);
    logger.info("Prepared create-game transaction", { gameId, userId, stake: game.stake });

    return jsonResponse({
      transaction: txData,
      gameId: gameId,
      stake: game.stake,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /contracts/game/:id/prepare-join - Prepare joinGame transaction
 * Returns transaction data for frontend to sign and send
 */
export async function handlePrepareJoinGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = pathname.substring("/contracts/game/".length).replace("/prepare-join", "");
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    // Get game from database
    const db = getDatabase();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      return errorResponse("Game not found", 404);
    }

    // Verify player is player2
    if (!game.player2 || game.player2.id !== userId) {
      return errorResponse("Only player2 can prepare join transaction", 403);
    }

    // Get contract game ID
    const contractGameId = getGameIdFromServerId(gameId);

    // Prepare transaction
    const txData = prepareJoinGameTransaction(contractGameId);
    logger.info("Prepared join-game transaction", { gameId, userId, contractGameId });

    return jsonResponse({
      transaction: txData,
      gameId: gameId,
      contractGameId: contractGameId,
      stake: game.stake,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /contracts/game/:id/prepare-bet - Prepare depositBet transaction
 * Returns transaction data for frontend to sign and send
 */
export async function handlePrepareBet(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = pathname.substring("/contracts/game/".length).replace("/prepare-bet", "");
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await req.json();
    const { amount } = body;

    if (typeof amount !== "number" || amount <= 0) {
      return errorResponse("Valid bet amount is required");
    }

    // Get game from database
    const db = getDatabase();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      return errorResponse("Game not found", 404);
    }

    // Verify player is in game
    if (game.player1.id !== userId && game.player2?.id !== userId) {
      return errorResponse("Player not in this game", 403);
    }

    // Get contract game ID
    const contractGameId = getGameIdFromServerId(gameId);

    // Prepare transaction
    const txData = prepareDepositBetTransaction(contractGameId, amount);
    logger.info("Prepared deposit-bet transaction", { gameId, userId, contractGameId, amount });

    return jsonResponse({
      transaction: txData,
      gameId: gameId,
      contractGameId: contractGameId,
      amount: amount,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /contracts/game/:id/payout - Payout winner (server-signed)
 * Only callable by server
 */
export async function handlePayoutWinner(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }

    const gameId = pathname.substring("/contracts/game/".length).replace("/payout", "");
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await req.json();
    const { winnerAddress, amount } = body;

    if (!winnerAddress || typeof amount !== "number" || amount <= 0) {
      return errorResponse("Valid winner address and amount required");
    }

    // Get game from database
    const db = getDatabase();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      return errorResponse("Game not found", 404);
    }

    // Get contract game ID
    const contractGameId = getGameIdFromServerId(gameId);

    // Payout winner
    const txHash = await payoutWinner(contractGameId, winnerAddress as Address, amount);

    // Update database with transaction hash
    gameRepo.setPayoutTxHash(db, gameId, txHash);
    logger.info("Recorded payout transaction", {
      gameId,
      contractGameId,
      winnerAddress,
      amount,
      txHash,
    });

    return jsonResponse({
      success: true,
      transactionHash: txHash,
      gameId: gameId,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /contracts/game/:id/cancel - Cancel game (server-signed)
 * Only callable by server
 */
export async function handleCancelGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }

    const gameId = pathname.substring("/contracts/game/".length).replace("/cancel", "");
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    // Get game from database
    const db = getDatabase();
    const game = gameRepo.getGame(db, gameId);
    if (!game) {
      return errorResponse("Game not found", 404);
    }

    // Get contract game ID
    const contractGameId = getGameIdFromServerId(gameId);

    // Cancel game
    const txHash = await cancelGame(contractGameId);
    logger.info("Cancelled game on contract", { gameId, contractGameId, txHash });

    return jsonResponse({
      success: true,
      transactionHash: txHash,
      gameId: gameId,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * GET /contracts/server-address - Get server wallet address
 */
export function handleGetServerAddress(): Response {
  try {
    const address = getServerWalletAddress();
    return jsonResponse({ serverAddress: address });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to get server address"
    );
  }
}
