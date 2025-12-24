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
		startNextRound
	} from '$lib/api';
	import { subscribe, unsubscribe, gameState, connectionStatus, errorMessage } from '$lib/websocket';
	import type { GameStateView, GamePhase } from '@civil-sarabande/shared';

	const GAME_CONSTANTS = {
		BOARD_SIZE: 6
	};

	let game: GameStateView | null = null;
	let loading = true;
	let actionError: string | null = null;

	// Form state
	let selfColumn = 0;
	let otherRow = 0;
	let betAmount = 0;
	let revealColumn = 0;

	// Subscribe to stores
	gameState.subscribe((value) => {
		if (value) {
			game = value;
			loading = false;
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

	function isMovePhase(phase: GamePhase): boolean {
		return phase === 'move1' || phase === 'move2' || phase === 'move3';
	}

	function isBettingPhase(phase: GamePhase): boolean {
		return phase === 'bet1' || phase === 'bet2' || phase === 'bet3' || phase === 'finalBet';
	}

	function canMakeMove(): boolean {
		if (!game) return false;
		if (!isMovePhase(game.phase)) return false;
		
		// Check if player has already made their move for this phase
		const phaseNum = parseInt(game.phase.slice(-1));
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

	function getChosenColumns(): number[] {
		if (!game) return [];
		return [game.yourMoves[0], game.yourMoves[2], game.yourMoves[4]].filter(
			(col) => col !== undefined
		);
	}

	async function handleMakeMove() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await makeMove(game.gameId, selfColumn, otherRow);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to make move';
			loading = false;
		}
	}

	async function handleMakeBet() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await makeBet(game.gameId, betAmount);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to place bet';
			loading = false;
		}
	}

	async function handleFold() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await foldBet(game.gameId);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to fold';
			loading = false;
		}
	}

	async function handleReveal() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await makeRevealMove(game.gameId, revealColumn);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to reveal';
			loading = false;
		}
	}

	async function handleEndRound() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await endRound(game.gameId);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to end round';
			loading = false;
		}
	}

	async function handleNextRound() {
		if (!game) return;

		actionError = null;
		loading = true;

		try {
			await startNextRound(game.gameId);
			// Game state will be updated via WebSocket
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to start next round';
			loading = false;
		}
	}
</script>

{#if loading && !game}
	<div>Loading game...</div>
{:else if !game}
	<div>Game not found</div>
{:else}
	<div>
		<h1>Game: {game.gameId}</h1>

		{#if actionError}
			<div>Error: {actionError}</div>
		{/if}

		<div>
			<div>Phase: {game.phase}</div>
			<div>Round: {game.roundNumber}</div>
			<div>
				Player 1: {game.player1.name || 'Unknown'} {game.yourRole === 'player1' ? '(You)' : ''}
			</div>
			<div>
				Player 2: {game.player2?.name || 'Waiting...'} {game.yourRole === 'player2' ? '(You)' : ''}
			</div>
		</div>

		<div>
			<h2>Board</h2>
			<table>
				{#each Array(GAME_CONSTANTS.BOARD_SIZE) as _, row}
					<tr>
						{#each Array(GAME_CONSTANTS.BOARD_SIZE) as _, col}
							<td>
								{game.board[row * GAME_CONSTANTS.BOARD_SIZE + col]}
							</td>
						{/each}
					</tr>
				{/each}
			</table>
		</div>

		<div>
			<h2>Status</h2>
			<div>Your coins: {game.yourCoins}</div>
			<div>Opponent coins: {game.theirCoins}</div>
			<div>Your pot coins: {game.yourPotCoins}</div>
			<div>Opponent pot coins: {game.theirPotCoins}</div>
			<div>Total pot: {game.yourPotCoins + game.theirPotCoins}</div>
		</div>

		{#if game.phase === 'waiting'}
			<div>Waiting for opponent to join...</div>
		{:else if isMovePhase(game.phase) && canMakeMove()}
			<div>
				<h2>Make Move</h2>
				<form on:submit|preventDefault={handleMakeMove}>
					<div>
						<label for="selfColumn">Choose column for yourself (0-5):</label>
						<select id="selfColumn" bind:value={selfColumn}>
							{#each Array(6) as _, i}
								<option value={i}>{i}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="otherRow">Assign row to opponent (0-5):</label>
						<select id="otherRow" bind:value={otherRow}>
							{#each Array(6) as _, i}
								<option value={i}>{i}</option>
							{/each}
						</select>
					</div>
					<button type="submit" disabled={loading}>Make Move</button>
				</form>
			</div>
		{:else if isBettingPhase(game.phase) && canMakeBet()}
			<div>
				<h2>Place Bet</h2>
				<div>Your current pot: {game.yourPotCoins}</div>
				<div>Opponent pot: {game.theirPotCoins}</div>
				{#if game.yourPotCoins < game.theirPotCoins}
					<div>You need to match {game.theirPotCoins - game.yourPotCoins} more coins</div>
				{/if}
				<form on:submit|preventDefault={handleMakeBet}>
					<div>
						<label for="betAmount">Bet amount:</label>
						<input
							type="number"
							id="betAmount"
							bind:value={betAmount}
							min="0"
							max={game.yourCoins}
							required
						/>
					</div>
					<button type="submit" disabled={loading}>Place Bet</button>
				</form>
				{#if canFold()}
					<button type="button" on:click={handleFold} disabled={loading}>
						Fold
					</button>
				{/if}
			</div>
		{:else if game.phase === 'reveal' && canReveal()}
			<div>
				<h2>Reveal Column</h2>
				<div>Your chosen columns: {getChosenColumns().join(', ')}</div>
				<form on:submit|preventDefault={handleReveal}>
					<div>
						<label for="revealColumn">Choose column to reveal:</label>
						<select id="revealColumn" bind:value={revealColumn}>
							{#each getChosenColumns() as col}
								<option value={col}>{col}</option>
							{/each}
						</select>
					</div>
					<button type="submit" disabled={loading}>Reveal</button>
				</form>
			</div>
		{:else if game.phase === 'finalBet' && canMakeBet()}
			<div>
				<h2>Final Bet</h2>
				<div>Your current pot: {game.yourPotCoins}</div>
				<div>Opponent pot: {game.theirPotCoins}</div>
				<form on:submit|preventDefault={handleMakeBet}>
					<div>
						<label for="betAmount">Bet amount:</label>
						<input
							type="number"
							id="betAmount"
							bind:value={betAmount}
							min="0"
							max={game.yourCoins}
							required
						/>
					</div>
					<button type="submit" disabled={loading}>Place Bet</button>
				</form>
			</div>
		{:else if game.phase === 'roundEnd'}
			<div>
				<h2>Round End</h2>
				{#if !game.yourEndedRound}
					<button type="button" on:click={handleEndRound} disabled={loading}>
						End Round
					</button>
				{:else}
					<div>You have ended the round. Waiting for opponent...</div>
				{/if}
				{#if game.yourEndedRound && game.theirEndedRound}
					<button type="button" on:click={handleNextRound} disabled={loading}>
						Start Next Round
					</button>
				{/if}
			</div>
		{:else}
			<div>Waiting for opponent...</div>
		{/if}

		<div>
			<h2>Your Moves</h2>
			<div>{game.yourMoves.join(', ')}</div>
		</div>

		<div>
			<h2>Opponent Moves (Committed)</h2>
			<div>{game.theirMoves.join(', ')}</div>
		</div>

		<div>
			<div>Connection: {$connectionStatus}</div>
		</div>
	</div>
{/if}

