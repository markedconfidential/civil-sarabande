/**
 * Player ID Management
 *
 * Uses Privy authentication for player identification.
 * Player IDs are now Privy user IDs.
 */

import { get } from 'svelte/store';
import { authStore, getPrivyUserId } from './auth';

const PLAYER_NAME_KEY = 'civil-sarabande-player-name';

/**
 * Get the player ID from Privy authentication.
 *
 * @returns The Privy user ID, or empty string if not authenticated
 */
export function getPlayerId(): string {
	if (typeof window === 'undefined') {
		// Server-side rendering - return a placeholder
		return '';
	}

	// Get Privy user ID
	const privyUserId = getPrivyUserId();
	if (privyUserId) {
		return privyUserId;
	}

	// Fallback: not authenticated
	return '';
}

/**
 * Get the wallet address from Privy.
 *
 * @returns The wallet address, or null if not available
 */
export function getWalletAddress(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const state = get(authStore);
	return state.walletAddress;
}

/**
 * Check if the user is authenticated.
 *
 * @returns True if authenticated, false otherwise
 */
export function isAuthenticated(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	const state = get(authStore);
	return state.isAuthenticated;
}

/**
 * Get the stored player name from localStorage.
 * Note: This is a fallback. The primary source is the backend user profile.
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
 * Note: This is a local cache. The primary source is the backend user profile.
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

	localStorage.removeItem(PLAYER_NAME_KEY);
}

