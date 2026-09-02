<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { GamePhase } from '@civil-sarabande/shared';
	import { getPhaseDisplayName } from '$lib/game/phases';

	export let phase: GamePhase;
	export let roundNumber: number;
	export let connectionStatus: string;
	export let disabled = false;

	const dispatch = createEventDispatcher<{ leave: void }>();
</script>

<header class="game-header">
	<div class="phase-indicator">
		<span class="phase-name">{getPhaseDisplayName(phase)}</span>
		<span class="round-num">Round {roundNumber}</span>
	</div>
	<div class="header-actions">
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
		margin-bottom: var(--space-lg);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}
</style>
