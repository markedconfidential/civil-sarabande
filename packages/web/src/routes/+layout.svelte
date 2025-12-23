<script>
	import { onMount } from 'svelte';
	import { init } from '$lib/websocket';

	onMount(() => {
		init();
	});
</script>

<slot />

