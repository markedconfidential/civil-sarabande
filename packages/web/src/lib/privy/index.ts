/**
 * Privy Integration Utilities
 *
 * Helper functions for interacting with Privy from Svelte components.
 */

/**
 * Open the Privy login modal.
 */
export function login(): void {
	const privyLogin = (window as any).__privyLogin;
	if (privyLogin) {
		privyLogin();
	} else {
		console.error('Privy not initialized');
	}
}

/**
 * Log out the current user.
 */
export function logout(): Promise<void> {
	const privyLogout = (window as any).__privyLogout;
	if (privyLogout) {
		return privyLogout();
	} else {
		console.error('Privy not initialized');
		return Promise.resolve();
	}
}

/**
 * Get a fresh access token for API calls.
 * Returns null silently if Privy isn't ready yet (e.g., during initial page load).
 */
export async function getAccessToken(): Promise<string | null> {
	const privyGetAccessToken = (window as any).__privyGetAccessToken;
	if (privyGetAccessToken) {
		return privyGetAccessToken();
	}
	return null;
}

// Re-export the mount component
export { default as PrivyMount } from './PrivyMount.svelte';

