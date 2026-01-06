/**
 * Privy Integration Utilities
 *
 * Helper functions for interacting with Privy from Svelte components.
 */

/**
 * Open the Privy login modal.
 * No-op if Privy is not yet initialized.
 */
export function login(): void {
	const privyLogin = (window as any).__privyLogin;
	if (privyLogin) {
		privyLogin();
	}
	// Silently ignore if Privy isn't ready yet
}

/**
 * Log out the current user.
 * Resolves immediately if Privy is not yet initialized.
 */
export function logout(): Promise<void> {
	const privyLogout = (window as any).__privyLogout;
	if (privyLogout) {
		return privyLogout();
	}
	// Silently resolve if Privy isn't ready yet
	return Promise.resolve();
}

/**
 * Get a fresh access token for API calls.
 * Returns null if Privy is not yet initialized (this is expected during startup).
 */
export async function getAccessToken(): Promise<string | null> {
	const privyGetAccessToken = (window as any).__privyGetAccessToken;
	if (privyGetAccessToken) {
		return privyGetAccessToken();
	}
	// Not an error - Privy just isn't ready yet
	return null;
}

// Re-export the mount component
export { default as PrivyMount } from './PrivyMount.svelte';

