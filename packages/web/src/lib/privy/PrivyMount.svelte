<script lang="ts">
	/**
	 * Auth bootstrapper, mounted once by the layout.
	 *
	 * privy mode: dynamically loads React and the Privy provider and forwards
	 * its events into the auth store.
	 *
	 * dev mode: Privy is never loaded. The identity remembered in this browser
	 * (localStorage `cs.devIdentity`) is restored into the auth store so a
	 * reload keeps you signed in; otherwise the store is left signed out and
	 * pages offer the dev-login screen.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { authStore } from '$lib/auth';
	import { config } from '$lib/config';
	import { loadStoredDevIdentity } from '$lib/dev/identities';
	import type { Root } from 'react-dom/client';
	import type { PrivyEvent } from './types';

	let container: HTMLDivElement;
	let root: Root | null = null;

	onMount(() => {
		if (config.authMode === 'dev') {
			authStore.setDevIdentity(loadStoredDevIdentity());
			return;
		}

		// Dynamically import React and the Privy provider
		Promise.all([import('react'), import('react-dom/client'), import('./PrivyProvider')])
			.then(([React, ReactDOM, { PrivyProviderWrapper }]) => {
				// Create root and render
				root = ReactDOM.createRoot(container);

				const handleEvent = (event: PrivyEvent) => {
					switch (event.type) {
						case 'ready':
							authStore.setLoading(false);
							break;
						case 'authenticated':
							authStore.setAuthenticated(event.user, event.accessToken);
							break;
						case 'logout':
							authStore.logout();
							break;
						case 'wallet':
							authStore.setWalletAddress(event.address);
							break;
						case 'error':
							console.error('Privy error:', event.message);
							authStore.setLoading(false);
							authStore.setError(event.message ?? 'Auth unavailable; browsing in guest mode');
							break;
					}
				};

				root.render(
					React.createElement(PrivyProviderWrapper, {
						onEvent: handleEvent
					})
				);
			})
			.catch((error) => {
				console.error('Failed to load Privy auth:', error);
				authStore.setLoading(false);
				authStore.setError('Auth unavailable; browsing in guest mode');
			});
	});

	onDestroy(() => {
		if (root) {
			root.unmount();
		}
	});
</script>

<!-- Hidden container for React Privy provider -->
<div bind:this={container} style="display: none;" />
