/**
 * Privy React Provider
 *
 * React component that provides Privy authentication context.
 * This is mounted into the Svelte app to provide auth functionality.
 */

import React, { useEffect, useCallback } from 'react';
import {
	PrivyProvider as PrivyReactProvider,
	usePrivy,
	useWallets,
	type User
} from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { config, chain } from '$lib/config';
import type { EthereumProviderLike, PrivyEvent } from './types';

// Privy app ID from the validated client config
const PRIVY_APP_ID = config.privyAppId;

// Props for the provider
interface PrivyProviderProps {
	onEvent: (event: PrivyEvent) => void;
}

function isEthereumProviderLike(provider: unknown): provider is EthereumProviderLike {
	return (
		typeof provider === 'object' &&
		provider !== null &&
		'request' in provider &&
		typeof (provider as { request: unknown }).request === 'function'
	);
}

/**
 * Inner component that uses Privy hooks
 */
function PrivyAuthSync({ onEvent }: PrivyProviderProps) {
	const { ready, authenticated, user, logout, login, getAccessToken } = usePrivy();
	const { wallets } = useWallets();
	
	// Expose wallet provider for contract interactions
	useEffect(() => {
		if (!ready || !wallets.length) return;
		
		const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
		if (embeddedWallet) {
			// Get the provider from the wallet
			embeddedWallet
				.getEthereumProvider()
				.then((provider: unknown) => {
					if (isEthereumProviderLike(provider)) {
						window.ethereum = provider;
						window.privyProvider = provider;
					}
				})
				.catch(() => {
					// Provider not available yet
				}
			);
		}
	}, [ready, wallets]);

	// Sync auth state with Svelte
	useEffect(() => {
		if (!ready) return;

		if (authenticated && user) {
			// Get access token and send to Svelte
			getAccessToken().then((token) => {
				onEvent({ type: 'authenticated', user: user as User, accessToken: token });
			});
		} else {
			onEvent({ type: 'logout' });
		}
	}, [ready, authenticated, user, onEvent, getAccessToken]);

	// Sync wallet address
	useEffect(() => {
		if (!ready) return;

		const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
		onEvent({ type: 'wallet', address: embeddedWallet?.address ?? null });
	}, [ready, wallets, onEvent]);

	// Signal ready state
	useEffect(() => {
		if (ready) {
			onEvent({ type: 'ready' });
		}
	}, [ready, onEvent]);

	// Expose login/logout functions globally for Svelte to call
	useEffect(() => {
		window.__privyLogin = login;
		window.__privyLogout = logout;
		window.__privyGetAccessToken = getAccessToken;

		return () => {
			delete window.__privyLogin;
			delete window.__privyLogout;
			delete window.__privyGetAccessToken;
		};
	}, [login, logout, getAccessToken]);

	return null;
}

/**
 * Main Privy provider component
 */
export function PrivyProviderWrapper({ onEvent }: PrivyProviderProps) {
	if (!PRIVY_APP_ID) {
		console.error('VITE_PRIVY_APP_ID is not set');
		onEvent({ type: 'error', message: 'Privy app ID not configured' });
		return null;
	}

	const handleEvent = useCallback(
		(event: PrivyEvent) => {
			onEvent(event);
		},
		[onEvent]
	);

	return (
		<PrivyReactProvider
			appId={PRIVY_APP_ID}
			config={{
				loginMethods: ['email', 'sms'],
				appearance: {
					theme: 'dark',
					accentColor: '#7c3aed',
					showWalletLoginFirst: false
				},
				embeddedWallets: {
					createOnLogin: 'users-without-wallets',
					showWalletUIs: true
				},
				defaultChain: chain, // From VITE_CHAIN_ID (Base Sepolia or local Anvil)
				supportedChains: chain.id === baseSepolia.id ? [chain] : [chain, baseSepolia]
			}}
		>
			<PrivyAuthSync onEvent={handleEvent} />
		</PrivyReactProvider>
	);
}

export default PrivyProviderWrapper;
