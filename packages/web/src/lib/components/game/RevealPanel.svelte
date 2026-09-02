<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	/** The columns the player chose this round; one of them will score. */
	export let columns: number[];
	export let revealColumn = 0;
	export let loading = false;

	const dispatch = createEventDispatcher<{ submit: void }>();
</script>

<h2>Reveal Your Column</h2>
<p class="action-description">
	Choose which of your three columns to score. This column intersected with the rows assigned to
	you will determine your final score.
</p>
<form on:submit|preventDefault={() => dispatch('submit')} class="reveal-form">
	<div class="reveal-columns">
		{#each columns as col}
			<label class="column-choice" class:selected={revealColumn === col}>
				<input type="radio" name="revealColumn" value={col} bind:group={revealColumn} />
				<span class="column-num">Column {col}</span>
			</label>
		{/each}
	</div>
	<button type="submit" class="btn-gold btn-lg" disabled={loading}>
		{loading ? 'Revealing...' : 'Reveal Column'}
	</button>
</form>

<style>
	.reveal-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.reveal-columns {
		display: flex;
		gap: var(--space-md);
		justify-content: center;
	}

	.column-choice {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-md) var(--space-lg);
		background: var(--color-bg-dark);
		border: 2px solid var(--color-cell-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.column-choice input {
		display: none;
	}

	.column-choice:hover {
		border-color: var(--color-primary);
	}

	.column-choice.selected {
		border-color: var(--color-gold);
		background: rgba(201, 162, 39, 0.2);
	}

	.column-num {
		font-family: var(--font-display);
		font-weight: 600;
	}

	@media (max-width: 600px) {
		.reveal-columns {
			flex-direction: column;
		}
	}
</style>
