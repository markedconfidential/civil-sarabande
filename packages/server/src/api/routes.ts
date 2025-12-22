/**
 * API Routes
 *
 * REST API handlers for game operations.
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
 */
export async function handleCreateGame(req: Request): Promise<Response> {
  try {
    const body = await parseBody<CreateGameRequest>(req);

    if (!body.player || !body.player.id) {
      return errorResponse("Player with id is required");
    }
    if (typeof body.stake !== "number" || body.stake <= 0) {
      return errorResponse("Valid stake amount is required");
    }

    const game = store.createGame(body.player, body.stake);
    const view = toGameStateView(game, body.player.id);

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
 */
export function handleGetGame(
  pathname: string,
  playerId: string | null
): Response {
  const gameId = extractGameId(pathname);
  if (!gameId) {
    return errorResponse("Invalid game ID", 400);
  }

  const game = store.getGame(gameId);
  if (!game) {
    return errorResponse("Game not found", 404);
  }

  if (!playerId) {
    return errorResponse("Player ID required (use ?playerId=xxx)", 400);
  }

  // Verify player is in this game
  if (game.player1.id !== playerId && game.player2?.id !== playerId) {
    return errorResponse("Player not in this game", 403);
  }

  const view = toGameStateView(game, playerId);
  return jsonResponse({ game: view });
}

/**
 * POST /games/:id/join - Join an existing game
 */
export async function handleJoinGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<JoinGameRequest>(req);

    if (!body.player || !body.player.id) {
      return errorResponse("Player with id is required");
    }

    const game = store.joinGame(gameId, body.player);
    const view = toGameStateView(game, body.player.id);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/move - Make a move
 */
export async function handleMakeMove(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<MakeMoveRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }
    if (typeof body.selfColumn !== "number" || typeof body.otherRow !== "number") {
      return errorResponse("selfColumn and otherRow are required");
    }

    const game = store.makeMove(gameId, body.playerId, body.selfColumn, body.otherRow);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/bet - Place a bet
 */
export async function handleMakeBet(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<MakeBetRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }
    if (typeof body.amount !== "number") {
      return errorResponse("amount is required");
    }

    const game = store.makeBet(gameId, body.playerId, body.amount);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/fold - Fold current round
 */
export async function handleFold(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<FoldRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }

    const game = store.foldBet(gameId, body.playerId);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/reveal - Make reveal move
 */
export async function handleRevealMove(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<RevealMoveRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }
    if (typeof body.revealColumn !== "number") {
      return errorResponse("revealColumn is required");
    }

    const game = store.makeRevealMove(gameId, body.playerId, body.revealColumn);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/end-round - Signal round end
 */
export async function handleEndRound(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<EndRoundRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }

    const game = store.endRound(gameId, body.playerId);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/next-round - Start next round
 */
export async function handleNextRound(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    // Parse body to get playerId for the response view
    const body = await parseBody<{ playerId: string }>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }

    const game = store.startNextRound(gameId);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

/**
 * POST /games/:id/leave - Leave game
 */
export async function handleLeaveGame(
  req: Request,
  pathname: string
): Promise<Response> {
  try {
    const gameId = extractGameId(pathname);
    if (!gameId) {
      return errorResponse("Invalid game ID", 400);
    }

    const body = await parseBody<LeaveGameRequest>(req);

    if (!body.playerId) {
      return errorResponse("playerId is required");
    }

    const game = store.leaveGame(gameId, body.playerId);
    const view = toGameStateView(game, body.playerId);

    return jsonResponse<SuccessResponse>({ success: true, game: view });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
}

