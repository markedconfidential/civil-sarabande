/**
 * Sign-in entry points.
 *
 * In privy mode these open/close the Privy modal. In dev mode they route to
 * the dev-login page (and clear the remembered dev identity on logout), so
 * pages can call `login()` / `logout()` without knowing which mode is active.
 *
 * Tokens come from `getAccessToken` in `$lib/auth`; there is no token helper
 * here any more.
 */

import { goto } from '$app/navigation';
import { config } from '$lib/config';
import { authStore } from '$lib/auth';

/**
 * Open the Privy login modal, or go to the dev-login page in dev mode.
 * No-op if Privy is not yet initialized.
 */
export function login(): void {
	if (config.authMode === 'dev') {
		void goto('/dev-login');
		return;
	}
	const privyLogin = window.__privyLogin;
	if (privyLogin) {
		privyLogin();
	}
	// Silently ignore if Privy isn't ready yet
}

/**
 * Log out the current user.
 * Resolves immediately if Privy is not yet initialized.
 */
export async function logout(): Promise<void> {
	if (config.authMode === 'dev') {
		authStore.logout();
		await goto('/dev-login');
		return;
	}
	const privyLogout = window.__privyLogout;
	if (privyLogout) {
		return privyLogout();
	}
	// Silently resolve if Privy isn't ready yet
}

// Re-export the mount component
export { default as PrivyMount } from './PrivyMount.svelte';
