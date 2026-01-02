<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { init } from '$lib/websocket';
	import { PrivyMount } from '$lib/privy';
	import { isAuthenticated, isLoading } from '$lib/auth';
	import '../app.css';

	onMount(() => {
		init();
	});
</script>

<!-- Mount Privy React provider (hidden) -->
{#if browser}
	<PrivyMount />
{/if}

<div class="page">
	<slot />
</div>
