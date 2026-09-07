/**
 * Game API Routes
 *
 * REST handlers for game operations. Identity always comes from the bearer
 * token; request bodies never carry a player id. Engine and store errors
 * carry their own HTTP status (403 for membership, 404 for missing games,
 * 503 when the chain is unreachable, otherwise 400).
 */

import type {
  GameState,
  CreateGameRequest,
  MakeMoveRequest,
  MakeBetRequest,
  RevealMoveRequest,
  GameResponse,
  MyGameResponse,
  WaitingGamesResponse,
  SuccessResponse,
  ErrorResponse,
} from "@civil-sarabande/shared";
import { usdcToUnits } from "@civil-sarabande/shared";
import * as store from "../store/gameStore";
import { requireAuth } from "./auth";
import { getDatabase } from "../db/database";
import * as userRepo from "../db/userRepository";
import { toGameStateView } from "../game/view";
import { statusForError } from "../game/errors";
import { createLogger } from "../utils/logger";

const logger = createLogger("api/routes");

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a JSON body. An empty body yields {} so routes without a payload
 * can be called with or without one.
 */
async function parseBody<T extends object>(req: Request): Promise<Partial<T>> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(error: string, status = 400): Response {
  return jsonResponse<ErrorResponse>({ error }, status);
}

function errorFrom(err: unknown): Response {
  const status = statusForError(err);
  if (status >= 500) {
    logger.error("Request failed", { error: err });
  }
  return errorResponse(err instanceof Error ? err.message : "Unknown error", status);
}

function gameResponse(game: GameState, userId: string, status = 200): Response {
  return jsonResponse<SuccessResponse>({ success: true, game: toGameStateView(game, userId) }, status);
}

/**
 * Extract game ID from URL path. Expects format: /games/:id/...
 */
function extractGameId(pathname: string): string | null {
  const match = pathname.match(/^\/games\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Authenticate and load the caller's user record (must have a username). */
async function requirePlayer(
  req: Request
): Promise<{ userId: string; player: { id: string; name: string; address?: string } } | { error: Response }> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult;
  const { userId } = authResult;

  const db = getDatabase();
  const user = userRepo.getUserByPrivyId(db, userId);
  if (!user) {
    return { error: errorResponse("User not found. Please complete onboarding.", 400) };
  }
  if (!user.username) {
    return { error: errorResponse("Please set a username before playing.", 400) };
  }

  return {
    userId,
    player: { id: userId, name: user.username, address: user.walletAddress ?? undefined },
  };
}

/**
 * Wrap a game action: auth, game id, then the action; errors map to status.
 */
async function withGame(
  req: Request,
  pathname: string,
  action: (gameId: string, userId: string) => Promise<GameState> | GameState
): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  const gameId = extractGameId(pathname);
  if (!gameId) return errorResponse("Invalid game ID", 400);

  try {
    const game = await action(gameId, userId);
    return gameResponse(game, userId);
  } catch (err) {
    return errorFrom(err);
  }
}

function isValidStake(stake: unknown): stake is number {
  if (typeof stake !== "number" || !Number.isFinite(stake) || stake <= 0) return false;
  try {
    usdcToUnits(stake);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /games - Create a new, unfunded game.
 */
export async function handleCreateGame(req: Request): Promise<Response> {
  const result = await requirePlayer(req);
  if ("error" in result) return result.error;
  const { userId, player } = result;

  try {
    const body = await parseBody<CreateGameRequest>(req);
    if (!isValidStake(body.stake)) {
      return errorResponse("stake must be a positive USDC amount with at most 6 decimal places");
    }

    const game = store.createGame(player, body.stake);
    return jsonResponse<GameResponse>({ game: toGameStateView(game, userId) }, 201);
  } catch (err) {
    return errorFrom(err);
  }
}

/**
 * GET /games/waiting - Funded games available to join (public).
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
 * GET /games/mine - The caller's most recent unfinished game, or null.
 */
export async function handleGetMyGame(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  const game = store.findGameByPlayer(userId);
  const response: MyGameResponse = { game: game ? toGameStateView(game, userId) : null };
  return jsonResponse(response);
}

/**
 * GET /games/:id - Game state for the caller (reconciles waiting games with chain).
 */
export async function handleGetGame(req: Request, pathname: string): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  const gameId = extractGameId(pathname);
  if (!gameId) return errorResponse("Invalid game ID", 400);

  try {
    const game = await store.getGameForPlayer(gameId, userId);
    return jsonResponse<GameResponse>({ game: toGameStateView(game, userId) });
  } catch (err) {
    return errorFrom(err);
  }
}

/**
 * POST /games/:id/confirm-funding - Player 1 reports the escrow deposit.
 */
export async function handleConfirmFunding(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.confirmFunding(gameId, userId));
}

/**
 * POST /games/:id/join - Join a funded game as player 2.
 */
export async function handleJoinGame(req: Request, pathname: string): Promise<Response> {
  const result = await requirePlayer(req);
  if ("error" in result) return result.error;
  const { userId, player } = result;

  const gameId = extractGameId(pathname);
  if (!gameId) return errorResponse("Invalid game ID", 400);

  try {
    const game = await store.joinGame(gameId, player);
    return gameResponse(game, userId);
  } catch (err) {
    return errorFrom(err);
  }
}

/**
 * POST /games/:id/cancel - Player 1 cancels an unjoined game.
 */
export async function handleCancelGame(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.cancelGame(gameId, userId));
}

/**
 * POST /games/:id/move - Make a move.
 */
export async function handleMakeMove(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, async (gameId, userId) => {
    const body = await parseBody<MakeMoveRequest>(req);
    if (typeof body.selfColumn !== "number" || typeof body.otherRow !== "number") {
      throw new Error("selfColumn and otherRow are required");
    }
    return store.makeMove(gameId, userId, body.selfColumn, body.otherRow);
  });
}

/**
 * POST /games/:id/bet - Place a bet.
 */
export async function handleMakeBet(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, async (gameId, userId) => {
    const body = await parseBody<MakeBetRequest>(req);
    if (typeof body.amount !== "number") {
      throw new Error("amount is required");
    }
    return store.makeBet(gameId, userId, body.amount);
  });
}

/**
 * POST /games/:id/fold - Fold the current betting round.
 */
export async function handleFold(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.foldBet(gameId, userId));
}

/**
 * POST /games/:id/reveal - Choose the column to score.
 */
export async function handleRevealMove(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, async (gameId, userId) => {
    const body = await parseBody<RevealMoveRequest>(req);
    if (typeof body.revealColumn !== "number") {
      throw new Error("revealColumn is required");
    }
    return store.makeRevealMove(gameId, userId, body.revealColumn);
  });
}

/**
 * POST /games/:id/end-round - Confirm the round result.
 */
export async function handleEndRound(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.endRound(gameId, userId));
}

/**
 * POST /games/:id/next-round - Start the next round.
 */
export async function handleNextRound(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.startNextRound(gameId, userId));
}

/**
 * POST /games/:id/leave - Leave the game.
 */
export async function handleLeaveGame(req: Request, pathname: string): Promise<Response> {
  return withGame(req, pathname, (gameId, userId) => store.leaveGame(gameId, userId));
}
