<script lang="ts">
	import { HIDDEN_MOVE, type MoveList } from '@civil-sarabande/shared';

	export let yourMoves: MoveList;
	export let theirMoves: MoveList;

	const show = (moves: MoveList) =>
		moves.length > 0 ? moves.map((m) => (m === HIDDEN_MOVE ? '?' : String(m))).join(', ') : 'None yet';
</script>

<details class="moves-history">
	<summary>Move History</summary>
	<div class="moves-grid">
		<div>
			<h3>Your Moves</h3>
			<p class="moves-list">{show(yourMoves)}</p>
		</div>
		<div>
			<h3>Opponent's Moves</h3>
			<p class="moves-list">{show(theirMoves)}</p>
			<p class="moves-note">? marks a column the opponent has not revealed yet.</p>
		</div>
	</div>
</details>

<style>
	.moves-history {
		margin-top: var(--space-xl);
		padding: var(--space-md);
		background: var(--color-bg-card);
		border: 2px solid #0d0a0e;
		box-shadow: 0 0 0 1px #4a3f52;
	}

	.moves-history summary {
		cursor: pointer;
		color: var(--color-text-dim);
		font-size: 0.875rem;
		font-family: var(--font-display);
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
		margin-bottom: var(--space-xs);
	}

	.moves-note {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	@media (max-width: 600px) {
		.moves-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
