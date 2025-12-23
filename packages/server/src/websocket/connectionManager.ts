/**
 * WebSocket Connection Manager
 *
 * Tracks active WebSocket connections and associates them with players and games.
 */

import type { ServerWebSocket } from "bun";

/** Data attached to each WebSocket connection */
export interface ConnectionData {
  /** Player ID associated with this connection */
  playerId: string | null;
  /** Game IDs this connection is subscribed to */
  subscribedGames: Set<string>;
}

/** Map of player ID to their WebSocket connection */
const playerConnections = new Map<string, ServerWebSocket<ConnectionData>>();

/** Map of game ID to set of subscribed player IDs */
const gameSubscriptions = new Map<string, Set<string>>();

/**
 * Register a new WebSocket connection.
 * Called when a client first connects (before they identify themselves).
 */
export function registerConnection(ws: ServerWebSocket<ConnectionData>): void {
  // Connection is registered but not associated with a player yet
  ws.data.playerId = null;
  ws.data.subscribedGames = new Set();
}

/**
 * Associate a connection with a player ID.
 * Replaces any existing connection for that player.
 */
export function setPlayerConnection(
  ws: ServerWebSocket<ConnectionData>,
  playerId: string
): void {
  // If player already has a connection, close the old one
  const existingConnection = playerConnections.get(playerId);
  if (existingConnection && existingConnection !== ws) {
    // Unsubscribe from all games on old connection
    for (const gameId of existingConnection.data.subscribedGames) {
      unsubscribeFromGame(existingConnection, gameId);
    }
    existingConnection.close(1000, "Replaced by new connection");
  }

  // Set the new connection
  ws.data.playerId = playerId;
  playerConnections.set(playerId, ws);
}

/**
 * Subscribe a connection to a game.
 */
export function subscribeToGame(
  ws: ServerWebSocket<ConnectionData>,
  gameId: string
): boolean {
  const playerId = ws.data.playerId;
  if (!playerId) {
    return false;
  }

  // Add to connection's subscribed games
  ws.data.subscribedGames.add(gameId);

  // Add to game's subscriber list
  if (!gameSubscriptions.has(gameId)) {
    gameSubscriptions.set(gameId, new Set());
  }
  gameSubscriptions.get(gameId)!.add(playerId);

  return true;
}

/**
 * Unsubscribe a connection from a game.
 */
export function unsubscribeFromGame(
  ws: ServerWebSocket<ConnectionData>,
  gameId: string
): boolean {
  const playerId = ws.data.playerId;
  if (!playerId) {
    return false;
  }

  // Remove from connection's subscribed games
  ws.data.subscribedGames.delete(gameId);

  // Remove from game's subscriber list
  const subscribers = gameSubscriptions.get(gameId);
  if (subscribers) {
    subscribers.delete(playerId);
    if (subscribers.size === 0) {
      gameSubscriptions.delete(gameId);
    }
  }

  return true;
}

/**
 * Handle connection close.
 * Cleans up all subscriptions for this connection.
 */
export function handleDisconnect(ws: ServerWebSocket<ConnectionData>): void {
  const playerId = ws.data.playerId;

  // Unsubscribe from all games
  for (const gameId of ws.data.subscribedGames) {
    const subscribers = gameSubscriptions.get(gameId);
    if (subscribers && playerId) {
      subscribers.delete(playerId);
      if (subscribers.size === 0) {
        gameSubscriptions.delete(gameId);
      }
    }
  }
  ws.data.subscribedGames.clear();

  // Remove from player connections
  if (playerId) {
    const currentConnection = playerConnections.get(playerId);
    // Only remove if this is the current connection for the player
    if (currentConnection === ws) {
      playerConnections.delete(playerId);
    }
  }
}

/**
 * Get the WebSocket connection for a player.
 */
export function getPlayerConnection(
  playerId: string
): ServerWebSocket<ConnectionData> | undefined {
  return playerConnections.get(playerId);
}

/**
 * Get all player IDs subscribed to a game.
 */
export function getGameSubscribers(gameId: string): Set<string> {
  return gameSubscriptions.get(gameId) || new Set();
}

/**
 * Get all connections subscribed to a game.
 */
export function getGameConnections(
  gameId: string
): ServerWebSocket<ConnectionData>[] {
  const subscribers = gameSubscriptions.get(gameId);
  if (!subscribers) {
    return [];
  }

  const connections: ServerWebSocket<ConnectionData>[] = [];
  for (const playerId of subscribers) {
    const conn = playerConnections.get(playerId);
    if (conn) {
      connections.push(conn);
    }
  }
  return connections;
}

/**
 * Check if a player is subscribed to a game.
 */
export function isSubscribed(playerId: string, gameId: string): boolean {
  const subscribers = gameSubscriptions.get(gameId);
  return subscribers ? subscribers.has(playerId) : false;
}

/**
 * Get the number of active connections.
 */
export function getConnectionCount(): number {
  return playerConnections.size;
}

/**
 * Get the number of game subscriptions.
 */
export function getGameSubscriptionCount(): number {
  return gameSubscriptions.size;
}

