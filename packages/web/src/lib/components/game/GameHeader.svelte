<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { GamePhase } from '@civil-sarabande/shared';
	import { getPhaseDisplayName } from '$lib/game/phases';
	import { quickFade } from '$lib/motion';
	import Countdown from './Countdown.svelte';

	export let phase: GamePhase;
	export let roundNumber: number;
	export let connectionStatus: string;
	export let disabled = false;
	/** Epoch ms deadline for the pending action, or null when no clock runs */
	export let deadline: number | null = null;
	export let yourTurn = false;

	const dispatch = createEventDispatcher<{ leave: void; expired: void }>();
</script>

<header class="game-header">
	<div class="phase-indicator">
		{#key phase}
			<span class="phase-name" in:quickFade>{getPhaseDisplayName(phase)}</span>
		{/key}
		{#key roundNumber}
			<span class="round-num" in:quickFade>Round {roundNumber}</span>
		{/key}
	</div>
	<div class="header-actions">
		<Countdown {deadline} {yourTurn} on:expired={() => dispatch('expired')} />
		<span class="status-badge status-badge--{connectionStatus}">
			{connectionStatus}
		</span>
		<button class="btn-secondary btn-sm" on:click={() => dispatch('leave')} {disabled}>
			Leave
		</button>
	</div>
</header>

<style>
	.game-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-bottom: var(--space-lg);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-left: auto;
	}

	@media (max-width: 768px) {
		.game-header {
			margin-bottom: var(--space-md);
		}
	}
</style>
