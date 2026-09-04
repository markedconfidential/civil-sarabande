/**
 * WebSocket Client
 *
 * Manages the WebSocket connection to the game server for real-time updates.
 * Uses Svelte stores for reactive state management.
 *
 * Subscribing always sends the bearer token (Privy or `dev:<userId>`); the
 * server rejects unauthenticated subscriptions.
 */

import { writable, type Writable } from 'svelte/store';
import type {
	WSServerMessage,
	WSSubscribedMessage,
	WSGameStateUpdateMessage,
	WSPlayerJoinedMessage,
	WSPlayerLeftMessage,
	WSErrorMessage,
	WSSubscribeMessage,
	WSUnsubscribeMessage,
	WSPingMessage,
	GameStateView
} from '@civil-sarabande/shared';
import { config } from './config';
import { getAccessToken, getUserId } from './auth';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/** The game the client is subscribed to; null when not subscribed. */
export const gameState: Writable<GameStateView | null> = writable(null);

/** Socket status as shown in the game header. */
export const connectionStatus: Writable<ConnectionStatus> = writable('disconnected');

/** Last error from the socket or the server; null when clear. */
export const errorMessage: Writable<string | null> = writable(null);

/**
 * True once automatic reconnection has given up. The game page offers a
 * manual "Reconnect" button that calls `reconnect()`.
 */
export const reconnectExhausted: Writable<boolean> = writable(false);

const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 25_000;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let currentGameId: string | null = null;
/** Set by disconnect() so a deliberate close does not trigger reconnection */
let closedOnPurpose = false;

function wsUrl(): string {
	return `${config.wsUrl}/ws`;
}

function startPing(): void {
	stopPing();
	pingTimer = setInterval(() => {
		if (ws?.readyState === WebSocket.OPEN) {
			const ping: WSPingMessage = { type: 'ping' };
			ws.send(JSON.stringify(ping));
		}
	}, PING_INTERVAL_MS);
}

function stopPing(): void {
	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
}

function scheduleReconnect(): void {
	if (!currentGameId) return;
	if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		reconnectExhausted.set(true);
		errorMessage.set('Lost connection to the game server.');
		return;
	}
	reconnectAttempts++;
	const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10_000);
	reconnectTimeout = setTimeout(() => {
		reconnectTimeout = null;
		connect();
	}, delay);
}

/**
 * Open the socket. Reuses an OPEN or CONNECTING socket instead of creating a
 * second one. Returns the socket (possibly still connecting).
 */
function connect(): WebSocket | null {
	if (typeof window === 'undefined') return null;
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		return ws;
	}

	closedOnPurpose = false;
	connectionStatus.set('connecting');

	let socket: WebSocket;
	try {
		socket = new WebSocket(wsUrl());
	} catch (err) {
		console.error('Failed to create WebSocket connection:', err);
		errorMessage.set('Failed to connect to server');
		connectionStatus.set('disconnected');
		scheduleReconnect();
		return null;
	}
	ws = socket;

	socket.onopen = () => {
		if (ws !== socket) return;
		connectionStatus.set('connected');
		errorMessage.set(null);
		reconnectExhausted.set(false);
		reconnectAttempts = 0;
		startPing();

		// Resubscribe after a reconnect.
		if (currentGameId) {
			void sendSubscribe(currentGameId);
		}
	};

	socket.onmessage = (event) => {
		try {
			const message: WSServerMessage = JSON.parse(event.data);
			handleMessage(message);
		} catch (err) {
			console.error('Failed to parse WebSocket message:', err);
			errorMessage.set('Failed to parse server message');
		}
	};

	socket.onerror = (error) => {
		if (ws !== socket) return;
		console.error('WebSocket error:', error);
		// onclose follows and drives status + reconnection.
	};

	socket.onclose = () => {
		if (ws !== socket) return;
		ws = null;
		stopPing();
		connectionStatus.set('disconnected');
		if (!closedOnPurpose) {
			scheduleReconnect();
		}
	};

	return socket;
}

function send(message: WSSubscribeMessage | WSUnsubscribeMessage | WSPingMessage): boolean {
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
		return true;
	}
	return false;
}

async function sendSubscribe(gameId: string): Promise<void> {
	const token = await getAccessToken();
	if (!token) {
		errorMessage.set('Sign in to follow the game live.');
		return;
	}
	// The game may have changed while we awaited the token.
	if (currentGameId !== gameId) return;

	const message: WSSubscribeMessage = {
		type: 'subscribe',
		gameId,
		token,
		playerId: getUserId() ?? undefined
	};
	if (!send(message)) {
		errorMessage.set('WebSocket connection not available');
	}
}

// ---------------------------------------------------------------------------
// Inbound messages
// ---------------------------------------------------------------------------

function handleMessage(message: WSServerMessage): void {
	switch (message.type) {
		case 'subscribed':
			handleSubscribed(message);
			break;
		case 'gameStateUpdate':
			handleGameStateUpdate(message);
			break;
		case 'playerJoined':
			handlePlayerJoined(message);
			break;
		case 'playerLeft':
			handlePlayerLeft(message);
			break;
		case 'error':
			handleError(message);
			break;
		case 'pong':
		case 'unsubscribed':
			break;
		default:
			console.warn('Unknown message type:', (message as { type: string }).type);
	}
}

function applyGame(gameId: string, game: GameStateView): void {
	// Ignore late messages for a game we have left.
	if (currentGameId && gameId !== currentGameId) return;
	gameState.set(game);
	errorMessage.set(null);
}

function handleSubscribed(message: WSSubscribedMessage): void {
	applyGame(message.gameId, message.game);
}

function handleGameStateUpdate(message: WSGameStateUpdateMessage): void {
	applyGame(message.gameId, message.game);
}

function handlePlayerJoined(message: WSPlayerJoinedMessage): void {
	applyGame(message.gameId, message.game);
}

function handlePlayerLeft(message: WSPlayerLeftMessage): void {
	applyGame(message.gameId, message.game);
}

function handleError(message: WSErrorMessage): void {
	errorMessage.set(message.error);
	console.error('Server error:', message.error);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to a game for real-time updates. Opens the socket if needed and
 * always sends the bearer token.
 */
export async function subscribe(gameId: string): Promise<void> {
	if (currentGameId && currentGameId !== gameId) {
		// Switching games: drop the old state so the page never shows a stale board.
		gameState.set(null);
	}
	currentGameId = gameId;
	reconnectAttempts = 0;
	reconnectExhausted.set(false);

	const socket = connect();
	if (!socket) return;

	if (socket.readyState === WebSocket.OPEN) {
		await sendSubscribe(gameId);
		return;
	}
	// CONNECTING: onopen resubscribes via currentGameId.
}

/** Unsubscribe from a game and clear the local game state. */
export function unsubscribe(gameId: string): void {
	if (gameId === currentGameId) {
		currentGameId = null;
		gameState.set(null);
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
	}

	const message: WSUnsubscribeMessage = {
		type: 'unsubscribe',
		gameId,
		playerId: getUserId() ?? undefined
	};
	send(message);
}

/** Reset the retry budget and open a fresh connection (manual reconnect). */
export function reconnect(): void {
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
	reconnectAttempts = 0;
	reconnectExhausted.set(false);
	errorMessage.set(null);

	if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
		// Force a clean restart: closing triggers onclose → scheduleReconnect.
		const stale = ws;
		ws = null;
		stale.onclose = null;
		stale.onmessage = null;
		stale.onerror = null;
		stale.close();
	}
	connect();
}

/** Close the socket for good (no reconnection) and clear all state. */
export function disconnect(): void {
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
	stopPing();

	currentGameId = null;
	closedOnPurpose = true;
	reconnectAttempts = MAX_RECONNECT_ATTEMPTS;

	if (ws) {
		const stale = ws;
		ws = null;
		stale.close();
	}

	connectionStatus.set('disconnected');
	gameState.set(null);
}

/**
 * Initialize the WebSocket connection. Called once by the layout on mount.
 */
export function init(): void {
	if (typeof window !== 'undefined') {
		connect();
	}
}
