<script lang="ts">
	import { GAME_CONSTANTS, type GameStateView } from '@civil-sarabande/shared';
	import {
		calculateScores,
		getAssignedRows,
		getCellClasses,
		getChosenColumns,
		getTheirRevealedColumn,
		type CellPreview
	} from '$lib/game/selectors';
	import { popIn, quickFade } from '$lib/motion';
	import Numeral from '$lib/components/art/Numeral.svelte';
	import DamageNumber from '$lib/components/art/DamageNumber.svelte';
	import {
		BOARD_VIGNETTE_URL,
		PARCHMENT_URL,
		gridInkPaths,
		gridInkPathsGhost
	} from '$lib/art/surfaces';

	export let game: GameStateView;
	/** Column/row the player is composing; null when it is not their turn to move. */
	export let preview: CellPreview | null = null;

	const BOARD_SIZE = GAME_CONSTANTS.BOARD_SIZE;
	const inkPaths = gridInkPaths(BOARD_SIZE);
	const ghostPaths = gridInkPathsGhost(BOARD_SIZE);

	$: scores = calculateScores(game);
	$: showScores = getChosenColumns(game).length > 0 || getAssignedRows(game).length > 0;

	// The opponent's revealed column gets a gold ink frame once both have
	// revealed (finalBet, roundEnd). The selector mirrors it into the board
	// orientation the viewer sees.
	$: revealedColumn =
		game.phase === 'finalBet' || game.phase === 'roundEnd' ? getTheirRevealedColumn(game) : null;

	function cellClass(row: number, col: number, p: CellPreview | null, revealed: number | null) {
		const base = getCellClasses(game, row, col, p);
		return revealed === col ? `${base} revealed-column` : base;
	}

	// Floating score numbers when a round result lands (keyed on the round so
	// they play once per round).
	$: yourRole = game.yourRole;
	$: result = game.phase === 'roundEnd' ? game.roundResult : null;
	$: yourResultScore = result
		? yourRole === 'player1'
			? result.player1Score
			: result.player2Score
		: null;
	$: theirResultScore = result
		? yourRole === 'player1'
			? result.player2Score
			: result.player1Score
		: null;
</script>

<div class="board-container">
	<div
		class="board-frame"
		style="--parchment-url:{PARCHMENT_URL};--vignette-url:{BOARD_VIGNETTE_URL}"
	>
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
							<td class={cellClass(row, col, preview, revealedColumn)}>
								<Numeral value={game.board[row * BOARD_SIZE + col]} />
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>

		<svg
			class="board-ink"
			viewBox="0 0 {BOARD_SIZE} {BOARD_SIZE}"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{#each ghostPaths as d}
				<path {d} class="ink ink--ghost" />
			{/each}
			{#each inkPaths as d}
				<path {d} class="ink" />
			{/each}
		</svg>

		{#if result && yourResultScore !== null && theirResultScore !== null}
			{#key result.roundNumber}
				<div class="board-fx" aria-hidden="true">
					<span class="board-fx-you">
						<DamageNumber value={yourResultScore} tone="you" signed={false} />
					</span>
					<span class="board-fx-them">
						<DamageNumber value={theirResultScore} tone="them" signed={false} delay={250} />
					</span>
				</div>
			{/key}
		{/if}
	</div>

	{#if showScores}
		<div class="score-preview" transition:quickFade>
			<div class="score-item">
				<div class="score-label">Your Score</div>
				{#key scores.yourScore}
					<div class="score-value score-value--you" in:popIn>{scores.yourScore}</div>
				{/key}
			</div>
			<div class="score-item">
				<div class="score-label">Their Score</div>
				{#key scores.theirScore}
					<div
						class="score-value score-value--them"
						class:score-value--hidden={scores.theirScore === null}
						in:popIn
						title={scores.theirScore === null ? "Hidden until the opponent's columns are revealed" : undefined}
					>
						{scores.theirScore === null ? '?' : scores.theirScore}
					</div>
				{/key}
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
		{#if revealedColumn !== null}
			<div class="legend-item" transition:quickFade>
				<span class="legend-swatch legend-swatch--revealed"></span>
				<span>Opponent's revealed column</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.board-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-lg);
	}

	/* The ink grid lies over the cell area only (inside the headers). */
	.board-ink {
		position: absolute;
		top: var(--board-head);
		left: var(--board-head);
		width: calc(var(--board-cell) * 6);
		height: calc(var(--board-cell) * 6);
		pointer-events: none;
		z-index: 2;
		overflow: visible;
	}

	.ink {
		fill: none;
		stroke: #0d0a0e;
		stroke-opacity: 0.8;
		stroke-width: 1.5px;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.ink--ghost {
		stroke-opacity: 0.22;
		stroke-width: 3px;
	}

	.board-fx {
		position: absolute;
		top: var(--board-head);
		left: var(--board-head);
		width: calc(var(--board-cell) * 6);
		height: calc(var(--board-cell) * 6);
		pointer-events: none;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-evenly;
	}

	.score-value--hidden {
		opacity: 0.55;
	}

	.board-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-sm) var(--space-lg);
		font-size: 0.8rem;
		color: var(--color-text-dim);
	}

	@media (max-width: 768px) {
		.board-container {
			gap: var(--space-md);
		}
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.legend-swatch {
		width: 16px;
		height: 16px;
		border: 1px solid var(--color-cell-border);
		background-color: #d9c8a5;
	}

	.legend-swatch--your-col {
		background: linear-gradient(90deg, #8b4049 0 3px, rgba(139, 64, 73, 0.35) 3px 13px, #8b4049 13px);
		border-color: #0d0a0e;
	}

	.legend-swatch--their-row {
		background: linear-gradient(180deg, #c9a227 0 3px, rgba(201, 162, 39, 0.4) 3px 13px, #c9a227 13px);
		border-color: #0d0a0e;
	}

	.legend-swatch--scored {
		background: rgba(139, 64, 73, 0.6);
		box-shadow: inset 0 0 0 2px #c9a227;
		border-color: #0d0a0e;
	}

	.legend-swatch--revealed {
		background: #d9c8a5;
		box-shadow: inset 0 0 0 2px #c9a227, inset 0 0 0 3px #0d0a0e;
		border-color: #0d0a0e;
	}
</style>
