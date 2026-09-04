/**
 * REST API Client
 *
 * Functions to interact with the Civil Sarabande game server API.
 * Authenticated requests carry the bearer token from `getAccessToken()`
 * (a Privy access token or `dev:<userId>` in dev mode).
 *
 * Every game action resolves to the `GameStateView` the server returned, so
 * callers can apply it to local state immediately without waiting for the
 * WebSocket broadcast.
 */

import type {
	ClientConfigResponse,
	ConfirmFundingRequest,
	CreateGameRequest,
	ErrorResponse,
	FaucetRequest,
	GameResponse,
	GameStateView,
	JoinGameRequest,
	MakeBetRequest,
	MakeMoveRequest,
	MyGameResponse,
	RevealMoveRequest,
	SetWalletRequest,
	SuccessResponse,
	WaitingGamesResponse,
	WalletBalanceResponse
} from '@civil-sarabande/shared';
import { config } from './config';
import { getAccessToken } from './auth';

/** Error thrown for non-2xx responses; carries the HTTP status. */
export class ApiError extends Error {
	readonly status: number;
	readonly endpoint: string;

	constructor(message: string, status: number, endpoint: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.endpoint = endpoint;
	}
}

export function isApiError(err: unknown, status?: number): err is ApiError {
	return err instanceof ApiError && (status === undefined || err.status === status);
}

/** The user profile as returned by /users/me and /users/username. */
export interface UserProfile {
	privyUserId: string;
	username: string | null;
	walletAddress: string | null;
	needsUsername: boolean;
	createdAt?: number;
}

interface UserResponse {
	user: UserProfile;
}

export interface UsernameAvailability {
	available: boolean;
	username?: string;
	reason?: string;
}

async function parseError(response: Response, endpoint: string): Promise<ApiError> {
	const fallback = `HTTP ${response.status}: ${response.statusText}`;
	const body: Partial<ErrorResponse> | null = await response.json().catch(() => null);
	return new ApiError(body?.error || fallback, response.status, endpoint);
}

async function send<T>(
	endpoint: string,
	options: RequestInit,
	authenticated: boolean
): Promise<T> {
	const url = `${config.apiUrl}${endpoint}`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> | undefined)
	};

	if (authenticated) {
		const token = await getAccessToken();
		if (!token) {
			throw new ApiError('Not signed in', 401, endpoint);
		}
		headers['Authorization'] = `Bearer ${token}`;
	}

	let response: Response;
	try {
		response = await fetch(url, { ...options, headers });
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new ApiError(`Cannot reach the game server at ${config.apiUrl} (${detail})`, 0, endpoint);
	}

	if (!response.ok) {
		throw await parseError(response, endpoint);
	}

	return response.json() as Promise<T>;
}

/** Public request (no bearer token). */
function publicRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	return send<T>(endpoint, options, false);
}

/** Authenticated request; throws ApiError(401) when there is no token. */
function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	return send<T>(endpoint, options, true);
}

function post<T>(endpoint: string, body: unknown = {}, authenticated = true): Promise<T> {
	return send<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }, authenticated);
}

/** Game routes answer `{ game }` or `{ success, game }`; both carry the view. */
function gameOf(response: GameResponse | SuccessResponse): GameStateView {
	if (!response || typeof response !== 'object' || !('game' in response) || !response.game) {
		throw new ApiError('Server response did not include a game', 502, 'game');
	}
	return response.game;
}

// ============================================================================
// Server configuration
// ============================================================================

/** GET /config — what the server thinks the chain, contracts and auth mode are. */
export function getConfig(): Promise<ClientConfigResponse> {
	return publicRequest<ClientConfigResponse>('/config', { method: 'GET' });
}

// ============================================================================
// Users
// ============================================================================

/** GET /users/me — creates the user record on first call. */
export async function getMe(): Promise<UserProfile> {
	const response = await request<UserResponse>('/users/me', { method: 'GET' });
	return response.user;
}

/** POST /users/username */
export async function setUsername(username: string): Promise<UserProfile> {
	const response = await post<UserResponse>('/users/username', { username });
	return response.user;
}

/** GET /users/username/:username — public availability check. */
export function checkUsername(username: string): Promise<UsernameAvailability> {
	return publicRequest<UsernameAvailability>(`/users/username/${encodeURIComponent(username)}`, {
		method: 'GET'
	});
}

/** POST /users/wallet — link a wallet address to the current user. */
export async function setWallet(walletAddress: string): Promise<UserProfile> {
	const body: SetWalletRequest = { walletAddress };
	const response = await post<UserResponse>('/users/wallet', body);
	return response.user;
}

/** GET /wallet/balance — the server's view of the user's USDC balance. */
export function getWalletBalance(): Promise<WalletBalanceResponse> {
	return request<WalletBalanceResponse>('/wallet/balance', { method: 'GET' });
}

/** POST /dev/faucet — mint MockUSDC (dev auth mode only; 404 otherwise). */
export function faucet(address: string, amount: number): Promise<unknown> {
	const body: FaucetRequest = { address, amount };
	return post<unknown>('/dev/faucet', body);
}

// ============================================================================
// Games
// ============================================================================

/** POST /games — creates an unfunded game; player 1 must then fund escrow. */
export async function createGame(stake: number): Promise<GameStateView> {
	const body: CreateGameRequest = { stake };
	return gameOf(await post<GameResponse>('/games', body));
}

/** GET /games/waiting — funded games open to join (public). */
export async function listWaitingGames(): Promise<WaitingGamesResponse['games']> {
	const response = await publicRequest<WaitingGamesResponse>('/games/waiting', { method: 'GET' });
	return response.games;
}

/** GET /games/mine — the caller's most recent unfinished game, or null. */
export async function getMyGame(): Promise<GameStateView | null> {
	const response = await request<MyGameResponse>('/games/mine', { method: 'GET' });
	return response.game ?? null;
}

/** GET /games/:id */
export async function getGame(gameId: string): Promise<GameStateView> {
	return gameOf(await request<GameResponse>(`/games/${gameId}`, { method: 'GET' }));
}

/**
 * POST /games/:id/confirm-funding — player 1 reports that createGame is
 * mined. The server verifies the escrow on chain; the hash is informational.
 */
export async function confirmFunding(gameId: string, txHash?: string): Promise<GameStateView> {
	const body: ConfirmFundingRequest = txHash ? { txHash } : {};
	return gameOf(await post<GameResponse | SuccessResponse>(`/games/${gameId}/confirm-funding`, body));
}

/**
 * POST /games/:id/join — call after joinGame is mined on chain. The server
 * verifies the escrow shows you as player 2. Safe to retry.
 */
export async function joinGame(gameId: string, txHash?: string): Promise<GameStateView> {
	const body: JoinGameRequest = txHash ? { txHash } : {};
	return gameOf(await post<GameResponse | SuccessResponse>(`/games/${gameId}/join`, body));
}

/**
 * POST /games/:id/cancel — player 1 only, while waiting. Unfunded games are
 * deleted; funded games are refunded by the server and end.
 */
export async function cancelGame(gameId: string): Promise<GameStateView | null> {
	const response = await post<Partial<GameResponse & SuccessResponse>>(`/games/${gameId}/cancel`);
	return response?.game ?? null;
}

/** POST /games/:id/move */
export async function makeMove(
	gameId: string,
	selfColumn: number,
	otherRow: number
): Promise<GameStateView> {
	const body: MakeMoveRequest = { selfColumn, otherRow };
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/move`, body));
}

/** POST /games/:id/bet */
export async function makeBet(gameId: string, amount: number): Promise<GameStateView> {
	const body: MakeBetRequest = { amount };
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/bet`, body));
}

/** POST /games/:id/fold */
export async function foldBet(gameId: string): Promise<GameStateView> {
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/fold`));
}

/** POST /games/:id/reveal */
export async function makeRevealMove(gameId: string, revealColumn: number): Promise<GameStateView> {
	const body: RevealMoveRequest = { revealColumn };
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/reveal`, body));
}

/** POST /games/:id/end-round */
export async function endRound(gameId: string): Promise<GameStateView> {
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/end-round`));
}

/** POST /games/:id/next-round */
export async function startNextRound(gameId: string): Promise<GameStateView> {
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/next-round`));
}

/** POST /games/:id/leave */
export async function leaveGame(gameId: string): Promise<GameStateView> {
	return gameOf(await post<SuccessResponse>(`/games/${gameId}/leave`));
}
