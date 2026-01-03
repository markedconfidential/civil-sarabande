<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { authStore } from '$lib/auth';

	let container: HTMLDivElement;
	let root: any = null;

	onMount(async () => {
		// Dynamically import React and the Privy provider
		Promise.all([import('react'), import('react-dom/client'), import('./PrivyProvider')])
			.then(([React, ReactDOM, { PrivyProviderWrapper }]) => {
				// Create root and render
				root = ReactDOM.createRoot(container);

				const handleEvent = (event: any) => {
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
