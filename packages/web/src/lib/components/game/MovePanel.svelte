<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { GAME_CONSTANTS } from '@civil-sarabande/shared';

	export let selfColumn = 0;
	export let otherRow = 0;
	export let loading = false;

	const BOARD_SIZE = GAME_CONSTANTS.BOARD_SIZE;
	const dispatch = createEventDispatcher<{ submit: void }>();
</script>

<h2>Make Your Move</h2>
<p class="action-description">Choose a column for yourself and assign a row to your opponent.</p>
<form on:submit|preventDefault={() => dispatch('submit')} class="move-form">
	<div class="move-selectors">
		<div class="form-group">
			<label for="selfColumn">Your Column</label>
			<select id="selfColumn" bind:value={selfColumn}>
				{#each Array(BOARD_SIZE) as _, i}
					<option value={i}>Column {i}</option>
				{/each}
			</select>
		</div>
		<div class="form-group">
			<label for="otherRow">Opponent's Row</label>
			<select id="otherRow" bind:value={otherRow}>
				{#each Array(BOARD_SIZE) as _, i}
					<option value={i}>Row {i}</option>
				{/each}
			</select>
		</div>
	</div>
	<button type="submit" class="btn-primary btn-lg" disabled={loading}>
		{loading ? 'Submitting...' : 'Confirm Move'}
	</button>
</form>

<style>
	.move-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.move-selectors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-lg);
	}

	@media (max-width: 600px) {
		.move-selectors {
			grid-template-columns: 1fr;
		}
	}
</style>
