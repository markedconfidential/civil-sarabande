/**
 * REST API Client
 * 
 * Functions to interact with the Civil Sarabande game server API.
 */

import type {
	CreateGameRequest,
	CreateGameResponse,
	JoinGameRequest,
	SuccessResponse,
	WaitingGamesResponse,
	GameStateView,
	MakeMoveRequest,
	MakeBetRequest,
	Player,
	ErrorResponse,
} from '@civil-sarabande/shared';
import { getPlayerId } from './player';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Make a fetch request and handle errors.
 */
async function request<T>(
	endpoint: string,
	options: RequestInit = {}
): Promise<T> {
	const url = `${API_BASE_URL}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	if (!response.ok) {
		const error: ErrorResponse = await response.json().catch(() => ({
			error: `HTTP ${response.status}: ${response.statusText}`,
		}));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	return response.json();
}

/**
 * Create a new game.
 * 
 * @param playerName - The player's display name
 * @param stake - The stake amount for the game
 * @returns The created game state
 */
export async function createGame(
	playerName: string,
	stake: number
): Promise<GameStateView> {
	const playerId = getPlayerId();
	const player: Player = {
		id: playerId,
		name: playerName,
	};

	const body: CreateGameRequest = {
		player,
		stake,
	};

	const response: CreateGameResponse = await request<CreateGameResponse>(
		'/games',
		{
			method: 'POST',
			body: JSON.stringify(body),
		}
	);

	return response.game;
}

/**
 * List all games waiting for a second player.
 * 
 * @returns List of waiting games
 */
export async function listWaitingGames(): Promise<WaitingGamesResponse['games']> {
	const response: WaitingGamesResponse = await request<WaitingGamesResponse>(
		'/games/waiting',
		{
			method: 'GET',
		}
	);

	return response.games;
}

/**
 * Get the current state of a game.
 * 
 * @param gameId - The game ID
 * @returns The game state view for the current player
 */
export async function getGame(gameId: string): Promise<GameStateView> {
	const playerId = getPlayerId();
	const response: { game: GameStateView } = await request<{ game: GameStateView }>(
		`/games/${gameId}?playerId=${encodeURIComponent(playerId)}`,
		{
			method: 'GET',
		}
	);

	return response.game;
}

/**
 * Join an existing game.
 * 
 * @param gameId - The game ID to join
 * @param playerName - The player's display name
 * @returns The updated game state
 */
export async function joinGame(
	gameId: string,
	playerName: string
): Promise<GameStateView> {
	const playerId = getPlayerId();
	const player: Player = {
		id: playerId,
		name: playerName,
	};

	const body: JoinGameRequest = {
		player,
	};

	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/join`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		}
	);

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
	const playerId = getPlayerId();
	const body: MakeMoveRequest = {
		playerId,
		selfColumn,
		otherRow,
	};

	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/move`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		}
	);

	return response.game;
}

/**
 * Place a bet.
 * 
 * @param gameId - The game ID
 * @param amount - Number of coins to add to the pot
 * @returns The updated game state
 */
export async function makeBet(
	gameId: string,
	amount: number
): Promise<GameStateView> {
	const playerId = getPlayerId();
	const body: MakeBetRequest = {
		playerId,
		amount,
	};

	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/bet`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		}
	);

	return response.game;
}

/**
 * Fold the current betting round.
 * 
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function foldBet(gameId: string): Promise<GameStateView> {
	const playerId = getPlayerId();
	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/fold`,
		{
			method: 'POST',
			body: JSON.stringify({
				playerId,
			}),
		}
	);

	return response.game;
}

/**
 * Make a reveal move (choose which column to score).
 * 
 * @param gameId - The game ID
 * @param revealColumn - Which of the 3 columns to reveal (must be one you chose)
 * @returns The updated game state
 */
export async function makeRevealMove(
	gameId: string,
	revealColumn: number
): Promise<GameStateView> {
	const playerId = getPlayerId();
	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/reveal`,
		{
			method: 'POST',
			body: JSON.stringify({
				playerId,
				revealColumn,
			}),
		}
	);

	return response.game;
}

/**
 * Signal that you're ready to end the round.
 * 
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function endRound(gameId: string): Promise<GameStateView> {
	const playerId = getPlayerId();
	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/end-round`,
		{
			method: 'POST',
			body: JSON.stringify({
				playerId,
			}),
		}
	);

	return response.game;
}

/**
 * Start the next round.
 * 
 * @param gameId - The game ID
 * @returns The updated game state
 */
export async function startNextRound(gameId: string): Promise<GameStateView> {
	const playerId = getPlayerId();
	const response: SuccessResponse = await request<SuccessResponse>(
		`/games/${gameId}/next-round`,
		{
			method: 'POST',
			body: JSON.stringify({
				playerId,
			}),
		}
	);

	return response.game;
}

