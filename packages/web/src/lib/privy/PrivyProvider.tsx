/**
 * Privy React Provider
 *
 * React component that provides Privy authentication context.
 * This is mounted into the Svelte app to provide auth functionality.
 */

import React, { useEffect, useCallback } from 'react';
import { PrivyProvider as PrivyReactProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { base, baseSepolia } from 'viem/chains';

// Privy app ID from environment
const PRIVY_APP_ID = (import.meta as any).env?.VITE_PRIVY_APP_ID || '';

// Event types for communicating with Svelte
export type PrivyEvent =
	| { type: 'ready' }
	| { type: 'authenticated'; user: any; accessToken: string | null }
	| { type: 'logout' }
	| { type: 'wallet'; address: string | null }
	| { type: 'error'; message: string };

// Props for the provider
interface PrivyProviderProps {
	onEvent: (event: PrivyEvent) => void;
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
			embeddedWallet.getEthereumProvider().then((provider: any) => {
				if (provider) {
					(window as any).ethereum = provider;
					(window as any).privyProvider = provider;
				}
			}).catch(() => {
				// Provider not available yet
			});
		}
	}, [ready, wallets]);

	// Sync auth state with Svelte
	useEffect(() => {
		if (!ready) return;

		if (authenticated && user) {
			// Get access token and send to Svelte
			getAccessToken().then((token) => {
				onEvent({ type: 'authenticated', user, accessToken: token });
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
		(window as any).__privyLogin = login;
		(window as any).__privyLogout = logout;
		(window as any).__privyGetAccessToken = getAccessToken;

		return () => {
			delete (window as any).__privyLogin;
			delete (window as any).__privyLogout;
			delete (window as any).__privyGetAccessToken;
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
				defaultChain: baseSepolia, // Use Base Sepolia for testnet
				supportedChains: [baseSepolia, base] // Support both testnet and mainnet
			}}
		>
			<PrivyAuthSync onEvent={handleEvent} />
		</PrivyReactProvider>
	);
}

export default PrivyProviderWrapper;

