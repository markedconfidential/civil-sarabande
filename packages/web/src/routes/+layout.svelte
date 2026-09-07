<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { init } from '$lib/websocket';
	import { PrivyMount } from '$lib/privy';
	import { installAudioUnlock } from '$lib/audio';
	import MuteToggle from '$lib/components/art/MuteToggle.svelte';
	import '../app.css';

	// SvelteKit passes params to all layouts
	export const params: Record<string, string> = {};

	// Watercolor wash per route: the lobby hall, the duel chamber, or the
	// settlement vault once a game has ended.
	$: pathname = $page.url.pathname;
	$: scene = pathname.startsWith('/game/') ? 'duel' : pathname === '/' ? 'lobby' : 'lobby';

	onMount(() => {
		init();
		const removeUnlock = installAudioUnlock();
		return () => removeUnlock();
	});
</script>

<!-- Mount Privy React provider (hidden) -->
{#if browser}
	<PrivyMount />
{/if}

<div class="wash-layer wash-layer--{scene}" aria-hidden="true"></div>

<div class="top-chrome">
	<MuteToggle />
</div>

<div class="page">
	<slot />
</div>
