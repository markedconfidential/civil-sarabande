/**
 * REST API Client
 *
 * Functions to interact with the Civil Sarabande game server API.
 * All authenticated requests use Privy access tokens.
 */

import type {
	CreateGameResponse,
	SuccessResponse,
	WaitingGamesResponse,
	GameStateView,
	ErrorResponse
} from '@civil-sarabande/shared';
import { getAccessToken } from './privy';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Make a public fetch request (no authentication required).
 * Used for endpoints that don't need user authentication.
 */
async function publicRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const url = `${API_BASE_URL}${endpoint}`;
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...options.headers
	};

	const response = await fetch(url, {
		...options,
		headers
	});

	if (!response.ok) {
		const error: ErrorResponse = await response.json().catch(() => ({
			error: `HTTP ${response.status}: ${response.statusText}`
		}));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Make a fetch request and handle errors.
 * Automatically includes Privy access token for authentication.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const url = `${API_BASE_URL}${endpoint}`;

	// Get access token for authenticated requests
	const token = await getAccessToken();
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...options.headers
	};

	if (token) {
		(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
	}

	const response = await fetch(url, {
		...options,
		headers
	});

	if (!response.ok) {
		const error: ErrorResponse = await response.json().catch(() => ({
			error: `HTTP ${response.status}: ${response.statusText}`
		}));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Create a new game.
 * User info is extracted from the authentication token on the server.
 *
 * @param stake - The stake amount for the game
 * @returns The created game state
 */
export async function createGame(stake: number): Promise<GameStateView> {
	const response: CreateGameResponse = await request<CreateGameResponse>('/games', {
		method: 'POST',
		body: JSON.stringify({ stake })
	});

	return response.game;
}

/**
 * List all games waiting for a second player.
 * This is a public endpoint that doesn't require authentication.
 * 
 * @returns List of waiting games
 */
export async function listWaitingGames(): Promise<WaitingGamesResponse['games']> {
	const response: WaitingGamesResponse = await publicRequest<WaitingGamesResponse>(
		'/games/waiting',
		{
			method: 'GET'
		}
	);

	return response.games;
}

/**
 * Get the current state of a game.
 * User is identified by authentication token.
 *
 * @param gameId - The game ID
 * @returns The game state view for the current player
 */
export async function getGame(gameId: string): Promise<GameStateView> {
	const response: { game: GameStateView } = await request<{ game: GameStateView }>(
		`/games/${gameId}`,
		{
			method: 'GET'
		}
	);

	return response.game;
}

/**
 * Join an existing game.
 * User info is extracted from the authentication token on the server.
 *
 * @param gameId - The game ID to join
 * @returns The updated game state
 */
export async function joinGame(gameId: string): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/join`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	return response.game;
}

/**
 * Make a move in the game.
 *
 * @param gameId - The game ID
 * @param selfColumn - Column the player chooses for themselves (0-5)
 * @param otherRow - Row the player assigns to their opponent (0-5)
 * @returns The updated game state
 */
export async function makeMove(
	gameId: string,
	selfColumn: number,
	otherRow: number
): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/move`, {
		method: 'POST',
		body: JSON.stringify({ selfColumn, otherRow })
	});

	return response.game;
}

/**
 * Place a bet.
 *
 * @param gameId - The game ID
 * @param amount - Number of coins to add to the pot
 * @returns The updated game state
 */
export async function makeBet(gameId: string, amount: number): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/bet`, {
		method: 'POST',
		body: JSON.stringify({ amount })
	});

	return response.game;
}

/**
 * Fold the current betting round.
 *
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function foldBet(gameId: string): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/fold`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	return response.game;
}

/**
 * Make a reveal move (choose which column to score).
 *
 * @param gameId - The game ID
 * @param revealColumn - Which of the 3 columns to reveal (must be one you chose)
 * @returns The updated game state
 */
export async function makeRevealMove(gameId: string, revealColumn: number): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/reveal`, {
		method: 'POST',
		body: JSON.stringify({ revealColumn })
	});

	return response.game;
}

/**
 * Signal that you're ready to end the round.
 *
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function endRound(gameId: string): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/end-round`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	return response.game;
}

/**
 * Start the next round.
 *
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function startNextRound(gameId: string): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/next-round`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	return response.game;
}

/**
 * Leave a game.
 * User info is extracted from the authentication token on the server.
 *
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function leaveGame(gameId: string): Promise<GameStateView> {
	const response: SuccessResponse = await request<SuccessResponse>(`/games/${gameId}/leave`, {
		method: 'POST',
		body: JSON.stringify({})
	});

	return response.game;
}

