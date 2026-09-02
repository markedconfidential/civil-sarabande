<script lang="ts">
	import type { MoveList } from '@civil-sarabande/shared';

	export let yourMoves: MoveList;
	export let theirMoves: MoveList;
</script>

<details class="moves-history">
	<summary>Move History</summary>
	<div class="moves-grid">
		<div>
			<h3>Your Moves</h3>
			<p class="moves-list">{yourMoves.length > 0 ? yourMoves.join(', ') : 'None yet'}</p>
		</div>
		<div>
			<h3>Opponent's Moves (Revealed)</h3>
			<p class="moves-list">{theirMoves.length > 0 ? theirMoves.join(', ') : 'None yet'}</p>
		</div>
	</div>
</details>

<style>
	.moves-history {
		margin-top: var(--space-xl);
		padding: var(--space-md);
		background: var(--color-bg-card);
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-md);
	}

	.moves-history summary {
		cursor: pointer;
		color: var(--color-text-dim);
		font-size: 0.875rem;
	}

	.moves-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-lg);
		margin-top: var(--space-md);
	}

	.moves-list {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-text-dim);
	}

	@media (max-width: 600px) {
		.moves-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
