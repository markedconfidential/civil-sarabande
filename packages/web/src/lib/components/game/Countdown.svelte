<script lang="ts">
	/**
	 * Turn clock. Counts down to `deadline` (epoch ms). Emits `expired` once
	 * when it reaches zero. Placeholder visuals; the art pass restyles it while
	 * keeping these props and the event.
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';

	export let deadline: number | null = null;
	/** Whether the viewer is the one who must act */
	export let yourTurn = false;

	const dispatch = createEventDispatcher<{ expired: void }>();

	let remaining = 0;
	let expiredFor: number | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	function tick() {
		if (deadline === null) {
			remaining = 0;
			return;
		}
		remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
		if (remaining === 0 && expiredFor !== deadline) {
			expiredFor = deadline;
			dispatch('expired');
		}
	}

	$: {
		if (timer) clearInterval(timer);
		timer = null;
		if (deadline !== null) {
			tick();
			timer = setInterval(tick, 250);
		} else {
			remaining = 0;
		}
	}

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	$: minutes = Math.floor(remaining / 60);
	$: seconds = remaining % 60;
	$: urgent = deadline !== null && remaining <= 15;
</script>

{#if deadline !== null}
	<span class="countdown" class:countdown--yours={yourTurn} class:countdown--urgent={urgent} aria-live="off">
		<span class="countdown-label">{yourTurn ? 'Your move' : 'Waiting'}</span>
		<span class="countdown-time">{minutes}:{seconds.toString().padStart(2, '0')}</span>
	</span>
{/if}

<style>
	.countdown {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-sm);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--color-text-dim);
	}

	.countdown-label {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.countdown--yours {
		color: var(--color-gold);
	}

	.countdown--urgent .countdown-time {
		color: var(--color-error);
		animation: pulse 0.8s ease-in-out infinite;
	}
</style>
