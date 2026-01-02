<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getPlayerId } from '$lib/player';
	import { isAuthenticated, isLoading as authLoading } from '$lib/auth';
	import {
		getGame,
		makeMove,
		makeBet,
		foldBet,
		makeRevealMove,
		endRound,
		startNextRound,
		leaveGame
	} from '$lib/api';
	import { subscribe, unsubscribe, gameState, connectionStatus, errorMessage } from '$lib/websocket';
	import type { GameStateView, GamePhase } from '@civil-sarabande/shared';

	const BOARD_SIZE = 6;

	let game: GameStateView | null = null;
	let loading = true;
	let actionError: string | null = null;
	let actionLoading = false;

	// Form state
	let selfColumn = 0;
	let otherRow = 0;
	let betAmount = 0;
	let revealColumn = 0;

	// Hover state for board preview
	let hoverColumn: number | null = null;
	let hoverRow: number | null = null;

	// Subscribe to stores
	gameState.subscribe((value) => {
		if (value) {
			game = value;
			loading = false;
			actionLoading = false;
		}
	});

	errorMessage.subscribe((value) => {
		if (value) {
			actionError = value;
		}
	});

	onMount(() => {
		// Wait for auth to load
		const unsubAuth = authLoading.subscribe((isLoading) => {
			if (!isLoading) {
				if (!$isAuthenticated) {
					goto('/');
					return;
				}

				loadGame();
			}
		});

		return () => unsubAuth();
	});

	async function loadGame() {
		const gameId = $page.params.id;

		if (!gameId) {
			actionError = 'Invalid game ID';
			loading = false;
			return;
		}

		// Load initial game state
		try {
			game = await getGame(gameId);
			loading = false;
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to load game';
			loading = false;
		}

		// Subscribe to WebSocket updates
		await subscribe(gameId);
	}

	onDestroy(() => {
		const gameId = $page.params.id;
		const playerId = getPlayerId();
		if (gameId) {
			unsubscribe(gameId, playerId);
		}
	});

	// Phase helpers
	function isMovePhase(phase: GamePhase): boolean {
		return phase === 'move1' || phase === 'move2' || phase === 'move3';
	}

	function isBettingPhase(phase: GamePhase): boolean {
		return phase === 'bet1' || phase === 'bet2' || phase === 'bet3' || phase === 'finalBet';
	}

	function getMovePhaseNumber(phase: GamePhase): number {
		if (phase === 'move1' || phase === 'bet1') return 1;
		if (phase === 'move2' || phase === 'bet2') return 2;
		if (phase === 'move3' || phase === 'bet3') return 3;
		return 0;
	}

	function getPhaseDisplayName(phase: GamePhase): string {
		const names: Record<GamePhase, string> = {
			waiting: 'Waiting for Opponent',
			move1: 'Move 1',
			bet1: 'Betting Round 1',
			move2: 'Move 2',
			bet2: 'Betting Round 2',
			move3: 'Move 3',
			bet3: 'Betting Round 3',
			reveal: 'Reveal',
			finalBet: 'Final Betting',
			roundEnd: 'Round Complete',
			ended: 'Game Over'
		};
		return names[phase] || phase;
	}

	// Action availability checks
	function canMakeMove(): boolean {
		if (!game) return false;
		if (!isMovePhase(game.phase)) return false;
		const phaseNum = getMovePhaseNumber(game.phase);
		const expectedMoves = phaseNum * 2;
		return game.yourMoves.length < expectedMoves;
	}

	function canMakeBet(): boolean {
		if (!game) return false;
		if (!isBettingPhase(game.phase)) return false;
		return !game.yourBetMade || game.yourPotCoins < game.theirPotCoins;
	}

	function canFold(): boolean {
		if (!game) return false;
		if (!isBettingPhase(game.phase)) return false;
		return game.yourPotCoins < game.theirPotCoins;
	}

	function canReveal(): boolean {
		if (!game) return false;
		if (game.phase !== 'reveal') return false;
		return game.yourMoves.length < 7;
	}

	function canEndRound(): boolean {
		if (!game) return false;
		return game.phase === 'roundEnd' && !game.yourEndedRound;
	}

	function canStartNextRound(): boolean {
		if (!game) return false;
		return game.phase === 'roundEnd' && game.yourEndedRound && game.theirEndedRound;
	}

	// Get chosen columns from moves
	function getChosenColumns(): number[] {
		if (!game) return [];
		return [game.yourMoves[0], game.yourMoves[2], game.yourMoves[4]].filter(
			(col) => col !== undefined
		);
	}

	// Get assigned rows (rows opponent assigned to us)
	function getAssignedRows(): number[] {
		if (!game) return [];
		return [game.theirMoves[1], game.theirMoves[3], game.theirMoves[5]].filter(
			(row) => row !== undefined
		);
	}

	// Cell highlighting logic
	function getCellClasses(row: number, col: number): string {
		if (!game) return '';
		
		const classes: string[] = [];
		const chosenCols = getChosenColumns();
		const assignedRows = getAssignedRows();
		
		// Is this cell in one of our chosen columns?
		const isYourColumn = chosenCols.includes(col);
		
		// Is this cell in a row assigned to us by opponent?
		const isTheirRow = assignedRows.includes(row);
		
		// Is this a scored cell (intersection of our column and their row)?
		const isScored = isYourColumn && isTheirRow;
		
		if (isScored) {
			classes.push('scored');
		} else {
			if (isYourColumn) classes.push('your-column');
			if (isTheirRow) classes.push('their-row');
		}

		// Hover preview during move phase
		if (canMakeMove()) {
			if (col === selfColumn && row === otherRow) {
				classes.push('preview-intersection');
			} else if (col === selfColumn) {
				classes.push('preview-column');
			} else if (row === otherRow) {
				classes.push('preview-row');
			}
		}

		return classes.join(' ');
	}

	// Calculate current scores based on committed moves
	function calculateScores(): { yourScore: number; theirScore: number } {
		if (!game) return { yourScore: 0, theirScore: 0 };
		
		const chosenCols = getChosenColumns();
		const assignedRows = getAssignedRows();
		
		let yourScore = 0;
		const numScored = Math.min(chosenCols.length, assignedRows.length);
		
		for (let i = 0; i < numScored; i++) {
			const col = chosenCols[i];
			const row = assignedRows[i];
			yourScore += game.board[row * BOARD_SIZE + col];
		}

		// Opponent's score (simplified - they see mirrored board)
		// For display purposes, we compute based on their revealed moves
		let theirScore = 0;
		const theirCols = [game.theirMoves[0], game.theirMoves[2], game.theirMoves[4]].filter(v => v !== undefined);
		const yourAssignedRows = [game.yourMoves[1], game.yourMoves[3], game.yourMoves[5]].filter(v => v !== undefined);
		
		const theirNumScored = Math.min(theirCols.length, yourAssignedRows.length);
		for (let i = 0; i < theirNumScored; i++) {
			// Their column (from their perspective, mirrored)
			const theirCol = BOARD_SIZE - 1 - theirCols[i];
			// Row we assigned them (mirrored)
			const theirRow = BOARD_SIZE - 1 - yourAssignedRows[i];
			theirScore += game.board[theirRow * BOARD_SIZE + theirCol];
		}

		return { yourScore, theirScore };
	}

	// Action handlers
	async function handleMakeMove() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await makeMove(game.gameId, selfColumn, otherRow);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to make move';
			actionLoading = false;
		}
	}

	async function handleMakeBet() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await makeBet(game.gameId, betAmount);
			betAmount = 0; // Reset after successful bet
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to place bet';
			actionLoading = false;
		}
	}

	async function handleFold() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await foldBet(game.gameId);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to fold';
			actionLoading = false;
		}
	}

	async function handleReveal() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await makeRevealMove(game.gameId, revealColumn);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to reveal';
			actionLoading = false;
		}
	}

	async function handleEndRound() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await endRound(game.gameId);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to end round';
			actionLoading = false;
		}
	}

	async function handleNextRound() {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await startNextRound(game.gameId);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to start next round';
			actionLoading = false;
		}
	}

	async function handleLeaveGame() {
		if (!game) return;
		if (!confirm('Are you sure you want to leave? You may forfeit coins.')) return;
		
		actionError = null;
		actionLoading = true;

		try {
			await leaveGame(game.gameId);
			goto('/');
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to leave game';
			actionLoading = false;
		}
	}

	// Reactive score calculation
	$: scores = game ? calculateScores() : { yourScore: 0, theirScore: 0 };
	$: amountToCall = game ? Math.max(0, game.theirPotCoins - game.yourPotCoins) : 0;
</script>

{#if loading && !game}
	<div class="loading">
		<div class="loading-spinner"></div>
		<p>Loading game...</p>
	</div>
{:else if !game}
	<div class="container">
		<div class="alert alert--error">Game not found</div>
		<a href="/" class="btn-secondary">Return Home</a>
	</div>
{:else}
	<div class="container game-container">
		<!-- Header -->
		<header class="game-header">
			<div class="phase-indicator">
				<span class="phase-name">{getPhaseDisplayName(game.phase)}</span>
				<span class="round-num">Round {game.roundNumber}</span>
			</div>
			<div class="header-actions">
				<span class="status-badge status-badge--{$connectionStatus}">
					{$connectionStatus}
				</span>
				<button class="btn-secondary btn-sm" on:click={handleLeaveGame} disabled={actionLoading}>
					Leave
				</button>
			</div>
		</header>

		{#if actionError}
			<div class="alert alert--error">{actionError}</div>
		{/if}

		<!-- Players Bar -->
		<div class="players-bar">
			<div class="player-card player-card--you">
				<div class="player-name">
					{game.yourRole === 'player1' ? game.player1.name : game.player2?.name || 'You'}
					<span class="player-tag">You</span>
				</div>
				<div class="player-coins">{game.yourCoins} coins</div>
			</div>

			<div class="pot-display">
				<div class="pot-label">Total Pot</div>
				<div class="pot-value">{game.yourPotCoins + game.theirPotCoins}</div>
			</div>

			<div class="player-card player-card--opponent">
				<div class="player-name">
					{game.yourRole === 'player1' ? game.player2?.name || 'Waiting...' : game.player1.name}
				</div>
				<div class="player-coins">{game.theirCoins} coins</div>
			</div>
		</div>

		<!-- Game Board -->
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
								<td class={getCellClasses(row, col)}>
									{game.board[row * BOARD_SIZE + col]}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Score Preview -->
			{#if getChosenColumns().length > 0 || getAssignedRows().length > 0}
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

			<!-- Legend -->
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

		<!-- Action Panel -->
		<div class="action-panel">
			{#if game.phase === 'waiting'}
				<div class="waiting-state">
					<h2>Waiting for opponent to join</h2>
					<div class="waiting-dots">
						<span></span><span></span><span></span>
					</div>
					<p class="game-id-display">
						Share this game ID: <code>{game.gameId}</code>
					</p>
				</div>

			{:else if isMovePhase(game.phase) && canMakeMove()}
				<h2>Make Your Move</h2>
				<p class="action-description">
					Choose a column for yourself and assign a row to your opponent.
				</p>
				<form on:submit|preventDefault={handleMakeMove} class="move-form">
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
					<button type="submit" class="btn-primary btn-lg" disabled={actionLoading}>
						{actionLoading ? 'Submitting...' : 'Confirm Move'}
					</button>
				</form>

			{:else if isMovePhase(game.phase) && !canMakeMove()}
				<div class="waiting-state">
					<h2>Waiting for opponent's move</h2>
					<div class="waiting-dots">
						<span></span><span></span><span></span>
					</div>
				</div>

			{:else if isBettingPhase(game.phase) && canMakeBet()}
				<h2>{game.phase === 'finalBet' ? 'Final Betting Round' : 'Place Your Bet'}</h2>
				
				<div class="betting-info">
					<div class="bet-stat">
						<span class="bet-stat-label">Your pot</span>
						<span class="bet-stat-value">{game.yourPotCoins}</span>
					</div>
					<div class="bet-stat">
						<span class="bet-stat-label">Their pot</span>
						<span class="bet-stat-value">{game.theirPotCoins}</span>
					</div>
					{#if amountToCall > 0}
						<div class="bet-stat bet-stat--highlight">
							<span class="bet-stat-label">To call</span>
							<span class="bet-stat-value">{amountToCall}</span>
						</div>
					{/if}
				</div>

				<form on:submit|preventDefault={handleMakeBet} class="bet-form">
					<div class="form-group">
						<label for="betAmount">Bet Amount</label>
						<input
							type="number"
							id="betAmount"
							bind:value={betAmount}
							min="0"
							max={game.yourCoins}
							placeholder={amountToCall > 0 ? `${amountToCall} to call` : '0 to check'}
						/>
					</div>
					<div class="action-buttons">
						<button type="submit" class="btn-primary" disabled={actionLoading}>
							{betAmount === 0 ? 'Check' : betAmount <= amountToCall ? 'Call' : 'Raise'}
						</button>
						{#if canFold()}
							<button type="button" class="btn-danger" on:click={handleFold} disabled={actionLoading}>
								Fold
							</button>
						{/if}
					</div>
				</form>

			{:else if isBettingPhase(game.phase) && !canMakeBet()}
				<div class="waiting-state">
					<h2>Waiting for opponent's bet</h2>
					<div class="waiting-dots">
						<span></span><span></span><span></span>
					</div>
				</div>

			{:else if game.phase === 'reveal' && canReveal()}
				<h2>Reveal Your Column</h2>
				<p class="action-description">
					Choose which of your three columns to score. This column intersected with the rows 
					assigned to you will determine your final score.
				</p>
				<form on:submit|preventDefault={handleReveal} class="reveal-form">
					<div class="reveal-columns">
						{#each getChosenColumns() as col}
							<label class="column-choice" class:selected={revealColumn === col}>
								<input type="radio" name="revealColumn" value={col} bind:group={revealColumn} />
								<span class="column-num">Column {col}</span>
							</label>
						{/each}
					</div>
					<button type="submit" class="btn-gold btn-lg" disabled={actionLoading}>
						{actionLoading ? 'Revealing...' : 'Reveal Column'}
					</button>
				</form>

			{:else if game.phase === 'reveal' && !canReveal()}
				<div class="waiting-state">
					<h2>Waiting for opponent to reveal</h2>
					<div class="waiting-dots">
						<span></span><span></span><span></span>
					</div>
				</div>

			{:else if game.phase === 'roundEnd'}
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
					{#if canEndRound()}
						<button type="button" class="btn-primary btn-lg" on:click={handleEndRound} disabled={actionLoading}>
							Confirm Round End
						</button>
					{:else if canStartNextRound()}
						<button type="button" class="btn-gold btn-lg" on:click={handleNextRound} disabled={actionLoading}>
							Start Next Round
						</button>
					{:else}
						<p class="waiting-text">Waiting for opponent to confirm...</p>
					{/if}
				</div>

			{:else if game.phase === 'ended'}
				<h2>Game Over</h2>
				
				<div class="game-over-result">
					{#if game.yourCoins > game.theirCoins}
						<p class="winner-text winner-text--you">You Won the Game!</p>
					{:else if game.theirCoins > game.yourCoins}
						<p class="winner-text winner-text--them">Opponent Won</p>
					{:else}
						<p class="winner-text">The game ended in a tie!</p>
					{/if}
					
					<div class="final-coins">
						<p>Your final coins: <strong>{game.yourCoins}</strong></p>
						<p>Their final coins: <strong>{game.theirCoins}</strong></p>
					</div>
				</div>

				<a href="/" class="btn-gold btn-lg">Play Again</a>

			{:else}
				<div class="waiting-state">
					<h2>Waiting for opponent</h2>
					<div class="waiting-dots">
						<span></span><span></span><span></span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Moves History (collapsible) -->
		<details class="moves-history">
			<summary>Move History</summary>
			<div class="moves-grid">
				<div>
					<h3>Your Moves</h3>
					<p class="moves-list">{game.yourMoves.length > 0 ? game.yourMoves.join(', ') : 'None yet'}</p>
				</div>
				<div>
					<h3>Opponent's Moves (Revealed)</h3>
					<p class="moves-list">{game.theirMoves.length > 0 ? game.theirMoves.join(', ') : 'None yet'}</p>
				</div>
			</div>
		</details>
	</div>
{/if}

<style>
	.game-container {
		max-width: 900px;
	}

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

	/* Board enhancements */
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

	/* Legend */
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

	/* Action panel */
	.action-description {
		color: var(--color-text-dim);
		margin-bottom: var(--space-lg);
	}

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

	/* Betting */
	.betting-info {
		display: flex;
		gap: var(--space-lg);
		margin-bottom: var(--space-lg);
	}

	.bet-stat {
		text-align: center;
		padding: var(--space-md);
		background: var(--color-bg-dark);
		border-radius: var(--radius-md);
		flex: 1;
	}

	.bet-stat--highlight {
		background: rgba(201, 162, 39, 0.2);
		border: 1px solid var(--color-gold-dim);
	}

	.bet-stat-label {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		margin-bottom: var(--space-xs);
	}

	.bet-stat-value {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-gold);
	}

	.bet-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	/* Reveal */
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

	/* Round results */
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

	.winner-text {
		font-family: var(--font-display);
		font-size: 1.5rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.winner-text--you {
		color: var(--color-success);
	}

	.winner-text--them {
		color: var(--color-error);
	}

	.waiting-text {
		color: var(--color-text-dim);
		font-style: italic;
	}

	/* Game over */
	.game-over-result {
		text-align: center;
		margin-bottom: var(--space-xl);
	}

	.final-coins {
		margin-top: var(--space-lg);
		color: var(--color-text-dim);
	}

	.final-coins strong {
		color: var(--color-gold);
	}

	/* Game ID display */
	.game-id-display {
		margin-top: var(--space-lg);
		color: var(--color-text-dim);
		font-size: 0.875rem;
	}

	.game-id-display code {
		display: block;
		margin-top: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-bg-dark);
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		word-break: break-all;
	}

	/* Moves history */
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
		.move-selectors,
		.moves-grid,
		.final-scores {
			grid-template-columns: 1fr;
		}

		.reveal-columns {
			flex-direction: column;
		}

		.betting-info {
			flex-direction: column;
		}
	}
</style>
