<script lang="ts">
	import { GAME_CONSTANTS, type GameStateView } from '@civil-sarabande/shared';
	import {
		calculateScores,
		getAssignedRows,
		getCellClasses,
		getChosenColumns,
		type CellPreview
	} from '$lib/game/selectors';

	export let game: GameStateView;
	/** Column/row the player is composing; null when it is not their turn to move. */
	export let preview: CellPreview | null = null;

	const BOARD_SIZE = GAME_CONSTANTS.BOARD_SIZE;

	$: scores = calculateScores(game);
	$: showScores = getChosenColumns(game).length > 0 || getAssignedRows(game).length > 0;
</script>

<div class="board-container">
	<table class="board">
		<thead>
			<tr>
				<th class="corner"></th>
				{#each Array(BOARD_SIZE) as _, col}
					<th class="col-header">{col}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each Array(BOARD_SIZE) as _, row}
				<tr>
					<th class="row-header">{row}</th>
					{#each Array(BOARD_SIZE) as _, col}
						<td class={getCellClasses(game, row, col, preview)}>
							{game.board[row * BOARD_SIZE + col]}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

	{#if showScores}
		<div class="score-preview">
			<div class="score-item">
				<div class="score-label">Your Score</div>
				<div class="score-value score-value--you">{scores.yourScore}</div>
			</div>
			<div class="score-item">
				<div class="score-label">Their Score</div>
				<div class="score-value score-value--them">{scores.theirScore}</div>
			</div>
		</div>
	{/if}

	<div class="board-legend">
		<div class="legend-item">
			<span class="legend-swatch legend-swatch--your-col"></span>
			<span>Your columns</span>
		</div>
		<div class="legend-item">
			<span class="legend-swatch legend-swatch--their-row"></span>
			<span>Rows assigned to you</span>
		</div>
		<div class="legend-item">
			<span class="legend-swatch legend-swatch--scored"></span>
			<span>Scored cells</span>
		</div>
	</div>
</div>

<style>
	.board-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-lg);
	}

	.board td.preview-column {
		background: rgba(139, 64, 73, 0.15);
		border-left: 2px dashed var(--color-primary);
		border-right: 2px dashed var(--color-primary);
	}

	.board td.preview-row {
		background: rgba(201, 162, 39, 0.15);
		border-top: 2px dashed var(--color-gold-dim);
		border-bottom: 2px dashed var(--color-gold-dim);
	}

	.board td.preview-intersection {
		background: rgba(139, 64, 73, 0.4);
		border: 2px solid var(--color-primary);
	}

	.board .corner {
		background: transparent;
		border: none;
	}

	.board-legend {
		display: flex;
		gap: var(--space-lg);
		font-size: 0.8rem;
		color: var(--color-text-dim);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.legend-swatch {
		width: 16px;
		height: 16px;
		border-radius: 2px;
		border: 1px solid var(--color-cell-border);
	}

	.legend-swatch--your-col {
		background: var(--color-cell-your-col);
		border-color: var(--color-primary);
	}

	.legend-swatch--their-row {
		background: var(--color-cell-their-row);
		border-color: var(--color-gold-dim);
	}

	.legend-swatch--scored {
		background: var(--color-cell-scored);
		border-color: var(--color-primary);
	}
</style>
