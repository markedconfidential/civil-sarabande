/**
 * WebSocket Client
 * 
 * Manages WebSocket connection to the game server for real-time updates.
 * Uses Svelte stores for reactive state management.
 */

import { writable, type Writable } from 'svelte/store';
import type {
	WSServerMessage,
	WSClientMessage,
	WSSubscribedMessage,
	WSGameStateUpdateMessage,
	WSPlayerJoinedMessage,
	WSPlayerLeftMessage,
	WSErrorMessage,
	GameStateView,
} from '@civil-sarabande/shared';

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

// Store for the current game state
export const gameState: Writable<GameStateView | null> = writable(null);

// Store for connection status
export const connectionStatus: Writable<'disconnected' | 'connecting' | 'connected'> =
	writable('disconnected');

// Store for error messages
export const errorMessage: Writable<string | null> = writable(null);

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentGameId: string | null = null;
let currentPlayerId: string | null = null;

/**
 * Connect to the WebSocket server.
 */
function connect(): void {
	if (ws?.readyState === WebSocket.OPEN) {
		return;
	}

	connectionStatus.set('connecting');

	try {
		ws = new WebSocket(`${WS_BASE_URL}/ws`);

		ws.onopen = () => {
			connectionStatus.set('connected');
			errorMessage.set(null);
			reconnectAttempts = 0;

			// If we were subscribed to a game, resubscribe
			if (currentGameId && currentPlayerId) {
				subscribe(currentGameId, currentPlayerId);
			}
		};

		ws.onmessage = (event) => {
			try {
				const message: WSServerMessage = JSON.parse(event.data);
				handleMessage(message);
			} catch (err) {
				console.error('Failed to parse WebSocket message:', err);
				errorMessage.set('Failed to parse server message');
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
			errorMessage.set('WebSocket connection error');
			connectionStatus.set('disconnected');
		};

		ws.onclose = () => {
			connectionStatus.set('disconnected');
			ws = null;

			// Attempt to reconnect if we were connected
			if (reconnectAttempts < maxReconnectAttempts && currentGameId) {
				reconnectAttempts++;
				const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
				reconnectTimeout = setTimeout(() => {
					connect();
				}, delay);
			}
		};
	} catch (err) {
		console.error('Failed to create WebSocket connection:', err);
		errorMessage.set('Failed to connect to server');
		connectionStatus.set('disconnected');
	}
}

/**
 * Send a message to the WebSocket server.
 */
function sendMessage(message: WSClientMessage): void {
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	} else {
		console.error('WebSocket is not open');
		errorMessage.set('WebSocket connection not available');
	}
}

/**
 * Handle incoming WebSocket messages.
 */
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
			// Ping/pong for keepalive - no action needed
			break;

		case 'unsubscribed':
			// Unsubscription confirmed - no action needed
			break;

		default:
			console.warn('Unknown message type:', (message as { type: string }).type);
	}
}

/**
 * Handle subscription confirmation.
 */
function handleSubscribed(message: WSSubscribedMessage): void {
	gameState.set(message.game);
	errorMessage.set(null);
}

/**
 * Handle game state update.
 */
function handleGameStateUpdate(message: WSGameStateUpdateMessage): void {
	gameState.set(message.game);
	errorMessage.set(null);
}

/**
 * Handle player joined notification.
 */
function handlePlayerJoined(message: WSPlayerJoinedMessage): void {
	gameState.set(message.game);
	errorMessage.set(null);
}

/**
 * Handle player left notification.
 */
function handlePlayerLeft(message: WSPlayerLeftMessage): void {
	gameState.set(message.game);
	errorMessage.set(null);
}

/**
 * Handle error message.
 */
function handleError(message: WSErrorMessage): void {
	errorMessage.set(message.error);
	console.error('Server error:', message.error);
}

/**
 * Subscribe to a game for real-time updates.
 * 
 * @param gameId - The game ID to subscribe to
 * @param playerId - The player ID
 */
export function subscribe(gameId: string, playerId: string): void {
	currentGameId = gameId;
	currentPlayerId = playerId;

	if (!ws || ws.readyState !== WebSocket.OPEN) {
		connect();
		// Wait for connection to open before subscribing
		if (ws) {
			ws.addEventListener(
				'open',
				() => {
					sendMessage({
						type: 'subscribe',
						playerId,
						gameId,
					});
				},
				{ once: true }
			);
		}
		return;
	}

	sendMessage({
		type: 'subscribe',
		playerId,
		gameId,
	});
}

/**
 * Unsubscribe from a game.
 * 
 * @param gameId - The game ID to unsubscribe from
 * @param playerId - The player ID
 */
export function unsubscribe(gameId: string, playerId: string): void {
	if (gameId === currentGameId) {
		currentGameId = null;
		currentPlayerId = null;
	}

	if (ws?.readyState === WebSocket.OPEN) {
		sendMessage({
			type: 'unsubscribe',
			playerId,
			gameId,
		});
	}
}

/**
 * Disconnect from the WebSocket server.
 */
export function disconnect(): void {
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}

	currentGameId = null;
	currentPlayerId = null;
	reconnectAttempts = maxReconnectAttempts; // Prevent reconnection

	if (ws) {
		ws.close();
		ws = null;
	}

	connectionStatus.set('disconnected');
	gameState.set(null);
}

/**
 * Initialize the WebSocket connection.
 * Call this when the app starts.
 */
export function init(): void {
	if (typeof window !== 'undefined') {
		connect();
	}
}

