<script lang="ts">
	/**
	 * Turn clock. Counts down to `deadline` (epoch ms). Emits `expired` once
	 * when it reaches zero. Drawn as an ink ring that empties, with mm:ss.
	 * Gold when it is the viewer's turn; a red pulse under fifteen seconds.
	 */
	import { createEventDispatcher, onDestroy } from 'svelte';

	export let deadline: number | null = null;
	/** Whether the viewer is the one who must act */
	export let yourTurn = false;

	const dispatch = createEventDispatcher<{ expired: void }>();

	let remaining = 0;
	let total = 0;
	let expiredFor: number | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	function tick() {
		if (deadline === null) {
			remaining = 0;
			return;
		}
		remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
		if (remaining > total) total = remaining;
		if (remaining === 0 && expiredFor !== deadline) {
			expiredFor = deadline;
			dispatch('expired');
		}
	}

	$: {
		if (timer) clearInterval(timer);
		timer = null;
		if (deadline !== null) {
			total = 0;
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
	// ring: r=10 → circumference ≈ 62.83
	const CIRC = 2 * Math.PI * 10;
	$: fraction = total > 0 ? remaining / total : 0;
	$: dashOffset = CIRC * (1 - fraction);
</script>

{#if deadline !== null}
	<span
		class="countdown"
		class:countdown--yours={yourTurn}
		class:countdown--urgent={urgent}
		aria-live="off"
		title={yourTurn ? 'Time left for your move' : 'Time left for the opponent'}
	>
		<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" class="ring">
			<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" />
			<circle
				cx="12"
				cy="12"
				r="10"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="butt"
				stroke-dasharray={CIRC}
				stroke-dashoffset={dashOffset}
				transform="rotate(-90 12 12)"
				class="ring-arc"
			/>
			<rect x="11" y="4" width="2" height="4" fill="currentColor" />
		</svg>
		<span class="countdown-body">
			<span class="countdown-label">{yourTurn ? 'Your move' : 'Waiting'}</span>
			<span class="countdown-time">{minutes}:{seconds.toString().padStart(2, '0')}</span>
		</span>
	</span>
{/if}

<style>
	.countdown {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--color-text-dim);
		padding: 2px 8px 2px 4px;
		border: 2px solid #0d0a0e;
		box-shadow: 0 0 0 1px #4a3f52;
		background: #1a1520;
	}

	.ring {
		display: block;
		flex-shrink: 0;
	}

	.ring-arc {
		transition: stroke-dashoffset 250ms linear;
	}

	.countdown-body {
		display: inline-flex;
		flex-direction: column;
		line-height: 1.05;
	}

	.countdown-label {
		font-family: var(--font-display);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.countdown-time {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.countdown--yours {
		color: var(--color-gold);
		box-shadow: 0 0 0 1px #9a7d1c;
	}

	.countdown--urgent {
		color: var(--color-error);
		box-shadow: 0 0 0 1px #a84545;
		animation: pulse 0.8s ease-in-out infinite;
	}
</style>
