/**
 * Player ID Management
 * 
 * Handles automatic UUID generation and storage for players.
 * Player IDs are generated once and stored in localStorage.
 */

const PLAYER_ID_KEY = 'civil-sarabande-player-id';
const PLAYER_NAME_KEY = 'civil-sarabande-player-name';

/**
 * Get or create a player ID.
 * If no player ID exists in localStorage, generates a new UUID v4.
 * 
 * @returns The player ID (UUID string)
 */
export function getPlayerId(): string {
	if (typeof window === 'undefined') {
		// Server-side rendering - return a placeholder
		return '';
	}

	let playerId = localStorage.getItem(PLAYER_ID_KEY);
	
	if (!playerId) {
		// Generate new UUID v4
		playerId = crypto.randomUUID();
		localStorage.setItem(PLAYER_ID_KEY, playerId);
	}
	
	return playerId;
}

/**
 * Get the stored player name from localStorage.
 * 
 * @returns The player name, or null if not set
 */
export function getPlayerName(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	
	return localStorage.getItem(PLAYER_NAME_KEY);
}

/**
 * Set the player name in localStorage.
 * 
 * @param name - The player name to store
 */
export function setPlayerName(name: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	
	localStorage.setItem(PLAYER_NAME_KEY, name);
}

/**
 * Clear all player data from localStorage.
 * Useful for testing or resetting.
 */
export function clearPlayerData(): void {
	if (typeof window === 'undefined') {
		return;
	}
	
	localStorage.removeItem(PLAYER_ID_KEY);
	localStorage.removeItem(PLAYER_NAME_KEY);
}

