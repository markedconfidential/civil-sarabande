<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Scores } from '$lib/game/selectors';

	export let scores: Scores;
	export let canEndRound = false;
	export let canStartNextRound = false;
	export let loading = false;

	const dispatch = createEventDispatcher<{ endRound: void; nextRound: void }>();
</script>

<h2>Round Complete</h2>

<div class="round-result">
	<div class="final-scores">
		<div class="final-score">
			<span class="final-score-label">Your Score</span>
			<span class="final-score-value final-score-value--you">{scores.yourScore}</span>
		</div>
		<div class="final-score">
			<span class="final-score-label">Their Score</span>
			<span class="final-score-value final-score-value--them">{scores.theirScore}</span>
		</div>
	</div>

	<div class="winner-announcement">
		{#if scores.yourScore > scores.theirScore}
			<span class="winner-text winner-text--you">You won!</span>
		{:else if scores.theirScore > scores.yourScore}
			<span class="winner-text winner-text--them">Opponent won</span>
		{:else}
			<span class="winner-text">It's a tie!</span>
		{/if}
	</div>
</div>

<div class="action-buttons">
	{#if canEndRound}
		<button
			type="button"
			class="btn-primary btn-lg"
			on:click={() => dispatch('endRound')}
			disabled={loading}
		>
			Confirm Round End
		</button>
	{:else if canStartNextRound}
		<button
			type="button"
			class="btn-gold btn-lg"
			on:click={() => dispatch('nextRound')}
			disabled={loading}
		>
			Start Next Round
		</button>
	{:else}
		<p class="waiting-text">Waiting for opponent to confirm...</p>
	{/if}
</div>

<style>
	.round-result {
		text-align: center;
		margin-bottom: var(--space-xl);
	}

	.final-scores {
		display: flex;
		justify-content: center;
		gap: var(--space-2xl);
		margin-bottom: var(--space-lg);
	}

	.final-score {
		text-align: center;
	}

	.final-score-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-dim);
		margin-bottom: var(--space-xs);
	}

	.final-score-value {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 700;
	}

	.final-score-value--you {
		color: var(--color-primary-light);
	}

	.final-score-value--them {
		color: var(--color-gold);
	}

	.winner-announcement {
		margin-top: var(--space-lg);
	}

	.waiting-text {
		color: var(--color-text-dim);
		font-style: italic;
	}
</style>
