/**
 * Authentication Store
 *
 * Manages Privy authentication state for the application.
 * Provides reactive stores for auth status, user info, and wallet.
 */

import { writable, derived, get } from 'svelte/store';
import type { User } from '@privy-io/react-auth';

// Auth state interface
export interface AuthState {
	isLoading: boolean;
	isAuthenticated: boolean;
	user: User | null;
	walletAddress: string | null;
	accessToken: string | null;
}

// Initial state
const initialState: AuthState = {
	isLoading: true,
	isAuthenticated: false,
	user: null,
	walletAddress: null,
	accessToken: null
};

// Create the auth store
function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,
		setLoading: (isLoading: boolean) => update((state) => ({ ...state, isLoading })),
		setAuthenticated: (user: User | null, accessToken: string | null) =>
			update((state) => ({
				...state,
				isLoading: false,
				isAuthenticated: !!user,
				user,
				accessToken
			})),
		setWalletAddress: (walletAddress: string | null) =>
			update((state) => ({ ...state, walletAddress })),
		logout: () => set({ ...initialState, isLoading: false }),
		reset: () => set(initialState)
	};
}

export const authStore = createAuthStore();

// Derived stores for convenience
export const isAuthenticated = derived(authStore, ($auth) => $auth.isAuthenticated);
export const isLoading = derived(authStore, ($auth) => $auth.isLoading);
export const user = derived(authStore, ($auth) => $auth.user);
export const walletAddress = derived(authStore, ($auth) => $auth.walletAddress);
export const accessToken = derived(authStore, ($auth) => $auth.accessToken);

/**
 * Get the Privy user ID from the current user.
 */
export function getPrivyUserId(): string | null {
	const state = get(authStore);
	return state.user?.id ?? null;
}

/**
 * Get the access token for API calls.
 */
export function getAccessToken(): string | null {
	const state = get(authStore);
	return state.accessToken;
}

/**
 * Check if user has completed onboarding (has username).
 */
export const needsOnboarding = derived(authStore, ($auth) => {
	if (!$auth.isAuthenticated || !$auth.user) return false;
	// Check if user has a linked account but no custom username set
	// This will be determined by checking with the backend
	return false; // Placeholder - will be set after API call
});

// Onboarding status store
export const onboardingStatus = writable<{
	needsUsername: boolean;
	username: string | null;
	isLoading: boolean;
}>({
	needsUsername: false,
	username: null,
	isLoading: true
});

