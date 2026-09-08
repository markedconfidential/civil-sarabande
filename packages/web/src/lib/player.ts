/**
 * Player identity helpers.
 *
 * Thin wrappers over the auth store so components do not have to know which
 * auth mode is active. The player id is the Privy user id in privy mode and
 * the preset's user id (e.g. "aldric") in dev mode.
 */

import { get } from 'svelte/store';
import { authStore, getUserId } from './auth';

const PLAYER_NAME_KEY = 'civil-sarabande-player-name';

/**
 * Get the current player's id.
 *
 * @returns The user id, or empty string if not authenticated (or during SSR)
 */
export function getPlayerId(): string {
	if (typeof window === 'undefined') {
		return '';
	}
	return getUserId() ?? '';
}

/**
 * Get the wallet address from the auth store.
 *
 * @returns The wallet address, or null if not available
 */
export function getWalletAddress(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return get(authStore).walletAddress;
}

/**
 * Check if the user is authenticated.
 */
export function isAuthenticated(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	return get(authStore).isAuthenticated;
}

/**
 * Get the stored player name from localStorage.
 * Note: This is a fallback. The primary source is the backend user profile.
 */
export function getPlayerName(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		return localStorage.getItem(PLAYER_NAME_KEY);
	} catch {
		return null;
	}
}

/**
 * Set the player name in localStorage.
 * Note: This is a local cache. The primary source is the backend user profile.
 */
export function setPlayerName(name: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		localStorage.setItem(PLAYER_NAME_KEY, name);
	} catch {
		// Storage unavailable; the backend profile remains the source of truth.
	}
}

/**
 * Clear all player data from localStorage.
 */
export function clearPlayerData(): void {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		localStorage.removeItem(PLAYER_NAME_KEY);
	} catch {
		// Nothing to clear.
	}
}
