/**
 * Dev-mode sign-in.
 *
 * Selecting a preset identity:
 *   1. marks the auth store authenticated with token `dev:<userId>` and the
 *      preset's wallet address (remembered in localStorage `cs.devIdentity`)
 *   2. POST /users/wallet with that address so the server can map chain
 *      events back to the user
 *   3. GET /users/me; if no username is set, POST /users/username with the
 *      preset name ("taken" is tolerated)
 *   4. if the wallet's USDC balance is zero, POST /dev/faucet for 1000 USDC
 *
 * Steps 2 to 4 are best-effort where noted; failures come back as warnings so
 * the page can show them without blocking the sign-in.
 */

import { authStore, onboardingStatus } from '$lib/auth';
import { faucet, getMe, isApiError, setUsername, setWallet } from '$lib/api';
import { getUsdcBalance, toChainErrorMessage } from '$lib/chain';
import type { DevIdentity } from './identities';

export const DEV_FAUCET_AMOUNT = 1000;

export interface DevLoginResult {
	identity: DevIdentity;
	username: string | null;
	/** USDC base units after any faucet call, or null when the chain was unreachable */
	balanceUnits: bigint | null;
	faucetUsed: boolean;
	warnings: string[];
}

export type DevLoginStep = 'auth' | 'wallet' | 'username' | 'balance' | 'faucet';

export async function loginAsDevIdentity(
	identity: DevIdentity,
	onStep: (step: DevLoginStep) => void = () => {}
): Promise<DevLoginResult> {
	const warnings: string[] = [];

	onStep('auth');
	authStore.setDevIdentity(identity);

	onStep('wallet');
	await setWallet(identity.address);

	onStep('username');
	let username: string | null = null;
	try {
		const me = await getMe();
		username = me.username;
		if (!username) {
			try {
				const updated = await setUsername(identity.name);
				username = updated.username;
			} catch (err) {
				if (isApiError(err) && /taken|already/i.test(err.message)) {
					warnings.push(`Username "${identity.name}" is taken; pick one on the onboarding page.`);
				} else {
					throw err;
				}
			}
		}
	} catch (err) {
		warnings.push(`Could not set up the profile: ${err instanceof Error ? err.message : String(err)}`);
	}
	onboardingStatus.set({ needsUsername: !username, username, isLoading: false });

	onStep('balance');
	let balanceUnits: bigint | null = null;
	let faucetUsed = false;
	try {
		balanceUnits = await getUsdcBalance(identity.address);
	} catch (err) {
		warnings.push(`Could not read the USDC balance: ${toChainErrorMessage(err)}`);
	}

	if (balanceUnits === 0n) {
		onStep('faucet');
		try {
			await faucet(identity.address, DEV_FAUCET_AMOUNT);
			faucetUsed = true;
			balanceUnits = await getUsdcBalance(identity.address);
		} catch (err) {
			warnings.push(
				`Faucet failed: ${err instanceof Error ? err.message : String(err)}. Use the faucet button on the home page later.`
			);
		}
	}

	return { identity, username, balanceUnits, faucetUsed, warnings };
}
