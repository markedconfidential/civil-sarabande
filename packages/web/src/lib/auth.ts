/**
 * Authentication Store
 *
 * One store for both auth modes:
 *
 * - privy: PrivyMount feeds it from the Privy React provider (user, access
 *   token, embedded wallet address).
 * - dev:   the dev-login page feeds it a preset identity; the token is
 *   `dev:<userId>` and the wallet is the preset's Anvil account.
 *
 * `getAccessToken()` is the single async source of truth for bearer tokens
 * across the app. In dev mode it returns the dev token from the store; in
 * privy mode it asks the Privy provider for a fresh token.
 */

import { writable, derived, get } from 'svelte/store';
import type { User } from '@privy-io/react-auth';
import { config } from './config';
import { devTokenFor, storeDevIdentity, type DevIdentity } from './dev/identities';

export interface AuthState {
	isLoading: boolean;
	isAuthenticated: boolean;
	/** Which auth backend produced this session */
	mode: 'privy' | 'dev';
	/** Stable user id: the Privy user id or the dev identity's user id */
	userId: string | null;
	/** Privy user object (privy mode only) */
	user: User | null;
	/** Dev identity (dev mode only) */
	devIdentity: DevIdentity | null;
	walletAddress: string | null;
	/** Last known token. In privy mode this may be stale; use getAccessToken(). */
	accessToken: string | null;
	error: string | null;
}

const initialState: AuthState = {
	isLoading: true,
	isAuthenticated: false,
	mode: config.authMode,
	userId: null,
	user: null,
	devIdentity: null,
	walletAddress: null,
	accessToken: null,
	error: null
};

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(initialState);

	return {
		subscribe,
		setLoading: (isLoading: boolean) => update((state) => ({ ...state, isLoading })),
		/** Privy mode: a user signed in (or out, when user is null). */
		setAuthenticated: (user: User | null, accessToken: string | null) =>
			update((state) => ({
				...state,
				isLoading: false,
				isAuthenticated: !!user,
				mode: 'privy',
				userId: user?.id ?? null,
				user,
				devIdentity: null,
				accessToken,
				error: null
			})),
		setWalletAddress: (walletAddress: string | null) =>
			update((state) => ({ ...state, walletAddress })),
		/** Dev mode: sign in as a preset identity and remember it in this browser. */
		setDevIdentity: (identity: DevIdentity | null) => {
			storeDevIdentity(identity);
			update((state) => ({
				...state,
				isLoading: false,
				isAuthenticated: !!identity,
				mode: 'dev',
				userId: identity?.userId ?? null,
				user: null,
				devIdentity: identity,
				walletAddress: identity?.address ?? null,
				accessToken: identity ? devTokenFor(identity) : null,
				error: null
			}));
		},
		setError: (error: string) =>
			update((state) => ({
				...state,
				isLoading: false,
				error
			})),
		logout: () => {
			if (get(authStore).mode === 'dev') storeDevIdentity(null);
			set({ ...initialState, isLoading: false });
		},
		reset: () => set(initialState)
	};
}

export const authStore = createAuthStore();

// Derived stores for convenience
export const isAuthenticated = derived(authStore, ($auth) => $auth.isAuthenticated);
export const isLoading = derived(authStore, ($auth) => $auth.isLoading);
export const user = derived(authStore, ($auth) => $auth.user);
export const userId = derived(authStore, ($auth) => $auth.userId);
export const walletAddress = derived(authStore, ($auth) => $auth.walletAddress);
export const accessToken = derived(authStore, ($auth) => $auth.accessToken);
export const authError = derived(authStore, ($auth) => $auth.error);
export const devIdentity = derived(authStore, ($auth) => $auth.devIdentity);
export const isDevMode = config.authMode === 'dev';

/** The current user id (Privy id or dev user id), or null when signed out. */
export function getUserId(): string | null {
	return get(authStore).userId;
}

/** @deprecated Use getUserId(); kept so older call sites keep compiling. */
export function getPrivyUserId(): string | null {
	return getUserId();
}

/** The wallet address in the store, or null. */
export function getWalletAddress(): string | null {
	return get(authStore).walletAddress;
}

/**
 * Get a bearer token for API and WebSocket calls.
 *
 * Dev mode: `dev:<userId>` from the store (null when signed out).
 * Privy mode: a fresh token from the Privy provider, falling back to the last
 * token in the store when the provider is not mounted yet.
 */
export async function getAccessToken(): Promise<string | null> {
	const state = get(authStore);
	if (state.mode === 'dev' || config.authMode === 'dev') {
		return state.devIdentity ? devTokenFor(state.devIdentity) : null;
	}

	if (typeof window !== 'undefined' && window.__privyGetAccessToken) {
		try {
			const fresh = await window.__privyGetAccessToken();
			if (fresh) return fresh;
		} catch (err) {
			console.warn('Privy getAccessToken failed; using cached token', err);
		}
	}
	return state.accessToken;
}

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

export function resetOnboardingStatus(): void {
	onboardingStatus.set({ needsUsername: false, username: null, isLoading: false });
}
