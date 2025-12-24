/**
 * API Routes
 *
 * REST API handlers for game operations.
 * All game routes require Privy authentication.
 */

import type {
  GameState,
  GameStateView,
  CreateGameRequest,
  JoinGameRequest,
  MakeMoveRequest,
  MakeBetRequest,
  FoldRequest,
  RevealMoveRequest,
  EndRoundRequest,
  LeaveGameRequest,
  CreateGameResponse,
  WaitingGamesResponse,
  SuccessResponse,
  ErrorResponse,
} from "@civil-sarabande/shared";
import * as store from "../store/gameStore";
import { requireAuth, unauthorizedResponse } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert internal GameState to player-specific GameStateView.
 * Hides opponent's uncommitted moves and presents coins from player's perspective.
 */
function toGameStateView(
  game: GameState,
  playerId: string
): GameStateView {
  const isPlayer1 = game.player1.id === playerId;

  // Calculate committed moves (both players have made equal moves)
  const minMoves = Math.min(game.player1Moves.length, game.player2Moves.length);

  const yourMoves = isPlayer1 ? game.player1Moves : game.player2Moves;
  const theirMoves = isPlayer1
    ? game.player2Moves.slice(0, minMoves)
    : game.player1Moves.slice(0, minMoves);

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

    yourMoves,
    theirMoves,

    yourRole: isPlayer1 ? "player1" : "player2",
  };
}

/**
 * Parse JSON body from request.
 */
async function parseBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) {
    throw new Error("Request body is required");
  }
  return JSON.parse(text) as T;
}

/**
 * Create a JSON response.
 */
function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Create an error response.
 */
function errorResponse(error: string, status = 400): Response {
  return jsonResponse<ErrorResponse>({ error }, status);
}

/**
 * Extract game ID from URL path.
 * Expects format: /games/:id/...
 */
function extractGameId(pathname: string): string | null {
  const match = pathname.match(/^\/games\/([^/]+)/);
  return match ? match[1] : null;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /games - Create a new game
 * Requires authentication. Creates game with authenticated user.
 */
export async function handleCreateGame(req: Request): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    // Get user from database
    const db = getDatabase();
    const user = userRepo.getUserByPrivyId(db, userId);
    if (!user) {
      return errorResponse("User not found. Please complete onboarding.", 400);
    }
    if (!user.username) {
      return errorResponse("Please set a username before playing.", 400);
    }

    const body = await parseBody<{ stake: number }>(req);

    if (typeof body.stake !== "number" || body.stake <= 0) {
      return errorResponse("Valid stake amount is required");
    }

    // Create player object from user
    const player = {
      id: userId,
      name: user.username,
      address: user.walletAddress ?? undefined,
    };

    const game = store.createGame(player, body.stake);
    const view = toGameStateView(game, userId);

    return jsonResponse<CreateGameResponse>({ game: view }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * GET /games/waiting - List games available to join
 */
export function handleListWaitingGames(): Response {
  const games = store.listWaitingGames();

  const response: WaitingGamesResponse = {
    games: games.map((g) => ({
      gameId: g.gameId,
      player1: g.player1,
      stake: g.stake,
      createdAt: g.createdAt,
    })),
  };

  return jsonResponse(response);
}

/**
 * GET /games/:id - Get game state
 * Requires authentication. Returns game state for authenticated user.
 */
export async function handleGetGame(
  req: Request,
  pathname: string
): Promise<Response> {
  // Require authentication
  const authResult = await requireAuth(req);
  if ("error" in authResult) {
    return authResult.error;
  }
  const { userId } = authResult;

  const gameId = extractGameId(pathname);
  if (!gameId) {
    return errorResponse("Invalid game ID", 400);
  }

  const game = store.getGame(gameId);
  if (!game) {
    return errorResponse("Game not found", 404);
  }

  // Verify player is in this game
  if (game.player1.id !== userId && game.player2?.id !== userId) {
    return errorResponse("Player not in this game", 403);
  }

  const view = toGameStateView(game, userId);
  return jsonResponse({ game: view });
}

/**
 * POST /games/:id/join - Join an existing game
 * Requires authentication. Joins game as authenticated user.
 */
export async function handleJoinGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    // Get user from database
    const db = getDatabase();
    const user = userRepo.getUserByPrivyId(db, userId);
    if (!user) {
      return errorResponse("User not found. Please complete onboarding.", 400);
    }
    if (!user.username) {
      return errorResponse("Please set a username before playing.", 400);
    }

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    // Create player object from user
    const player = {
      id: userId,
      name: user.username,
      address: user.walletAddress ?? undefined,
    };

    const game = store.joinGame(gameId, player);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/move - Make a move
 * Requires authentication.
 */
export async function handleMakeMove(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<{ selfColumn: number; otherRow: number }>(req);

    if (typeof body.selfColumn !== "number" || typeof body.otherRow !== "number") {
      return errorResponse("selfColumn and otherRow are required");
    }

    const game = store.makeMove(gameId, userId, body.selfColumn, body.otherRow);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/bet - Place a bet
 * Requires authentication.
 */
export async function handleMakeBet(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<{ amount: number }>(req);

    if (typeof body.amount !== "number") {
      return errorResponse("amount is required");
    }

    const game = store.makeBet(gameId, userId, body.amount);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/fold - Fold current round
 * Requires authentication.
 */
export async function handleFold(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const game = store.foldBet(gameId, userId);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/reveal - Make reveal move
 * Requires authentication.
 */
export async function handleRevealMove(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<{ revealColumn: number }>(req);

    if (typeof body.revealColumn !== "number") {
      return errorResponse("revealColumn is required");
    }

    const game = store.makeRevealMove(gameId, userId, body.revealColumn);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/end-round - Signal round end
 * Requires authentication.
 */
export async function handleEndRound(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const game = store.endRound(gameId, userId);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/next-round - Start next round
 * Requires authentication.
 */
export async function handleNextRound(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const game = store.startNextRound(gameId);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/leave - Leave game
 * Requires authentication.
 */
export async function handleLeaveGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    // Require authentication
    const authResult = await requireAuth(req);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { userId } = authResult;

    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const game = store.leaveGame(gameId, userId);
    const view = toGameStateView(game, userId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

