/**
 * Dev-mode identities.
 *
 * Only used when VITE_AUTH_MODE=dev. Each preset is one of Anvil's default
 * funded accounts (0 to 3) with a name. The private keys are the well-known
 * Anvil test keys and hold nothing of value anywhere but a local chain.
 */

import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

export interface DevIdentity {
	/** Display name and, lowercased, the dev user id */
	name: string;
	/** `dev:<userId>` — what the server sees as the bearer token */
	userId: string;
	address: Address;
	privateKey: Hex;
	/** Anvil account index */
	index: number;
}

const PRESETS: Array<{ name: string; privateKey: Hex }> = [
	{
		name: 'Aldric',
		privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
	},
	{
		name: 'Morwenna',
		privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
	},
	{
		name: 'Tancred',
		privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
	},
	{
		name: 'Ysolde',
		privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
	}
];

export const DEV_IDENTITIES: readonly DevIdentity[] = PRESETS.map((preset, index) => ({
	name: preset.name,
	userId: preset.name.toLowerCase(),
	address: privateKeyToAccount(preset.privateKey).address,
	privateKey: preset.privateKey,
	index
}));

export const DEV_IDENTITY_STORAGE_KEY = 'cs.devIdentity';

export function devTokenFor(identity: DevIdentity): string {
	return `dev:${identity.userId}`;
}

export function findDevIdentity(nameOrId: string | null | undefined): DevIdentity | null {
	if (!nameOrId) return null;
	const key = nameOrId.toLowerCase();
	return DEV_IDENTITIES.find((identity) => identity.userId === key) ?? null;
}

/** The identity remembered in this browser, if any. */
export function loadStoredDevIdentity(): DevIdentity | null {
	if (typeof window === 'undefined') return null;
	try {
		return findDevIdentity(window.localStorage.getItem(DEV_IDENTITY_STORAGE_KEY));
	} catch {
		return null;
	}
}

export function storeDevIdentity(identity: DevIdentity | null): void {
	if (typeof window === 'undefined') return;
	try {
		if (identity) {
			window.localStorage.setItem(DEV_IDENTITY_STORAGE_KEY, identity.userId);
		} else {
			window.localStorage.removeItem(DEV_IDENTITY_STORAGE_KEY);
		}
	} catch {
		// Storage unavailable (private mode, etc.). The session still works.
	}
}
