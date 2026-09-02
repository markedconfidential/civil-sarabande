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
	import type { GameStateView } from '@civil-sarabande/shared';
	import { isBettingPhase, isMovePhase } from '$lib/game/phases';
	import {
		calculateScores,
		canEndRound,
		canMakeBet,
		canMakeMove,
		canReveal,
		canStartNextRound,
		getChosenColumns
	} from '$lib/game/selectors';

	import GameHeader from '$lib/components/game/GameHeader.svelte';
	import PlayersBar from '$lib/components/game/PlayersBar.svelte';
	import Board from '$lib/components/game/Board.svelte';
	import WaitingState from '$lib/components/game/WaitingState.svelte';
	import MovePanel from '$lib/components/game/MovePanel.svelte';
	import BetPanel from '$lib/components/game/BetPanel.svelte';
	import RevealPanel from '$lib/components/game/RevealPanel.svelte';
	import RoundEndPanel from '$lib/components/game/RoundEndPanel.svelte';
	import GameOverPanel from '$lib/components/game/GameOverPanel.svelte';
	import MoveHistory from '$lib/components/game/MoveHistory.svelte';

	let game: GameStateView | null = null;
	let loading = true;
	let actionError: string | null = null;
	let actionLoading = false;

	// Form state
	let selfColumn = 0;
	let otherRow = 0;
	let betAmount = 0;
	let revealColumn = 0;

	// Subscribe to stores
	const unsubGameState = gameState.subscribe((value) => {
		if (value) {
			game = value;
			loading = false;
			actionLoading = false;
		}
	});

	const unsubError = errorMessage.subscribe((value) => {
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
		unsubGameState();
		unsubError();
		const gameId = $page.params.id;
		const playerId = getPlayerId();
		if (gameId) {
			unsubscribe(gameId, playerId);
		}
	});

	// Run an action against the server, surfacing errors and tracking loading state.
	// Loading is cleared by the next game state update, or immediately on error.
	async function runAction(action: (gameId: string) => Promise<unknown>, failureMessage: string) {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			await action(game.gameId);
		} catch (err) {
			actionError = err instanceof Error ? err.message : failureMessage;
			actionLoading = false;
			throw err;
		}
	}

	// Action handlers
	function handleMakeMove() {
		runAction((id) => makeMove(id, selfColumn, otherRow), 'Failed to make move').catch(() => {});
	}

	function handleMakeBet() {
		runAction(
			async (id) => {
				await makeBet(id, betAmount);
				betAmount = 0; // Reset after successful bet
			},
			'Failed to place bet'
		).catch(() => {});
	}

	function handleFold() {
		runAction((id) => foldBet(id), 'Failed to fold').catch(() => {});
	}

	function handleReveal() {
		runAction((id) => makeRevealMove(id, revealColumn), 'Failed to reveal').catch(() => {});
	}

	function handleEndRound() {
		runAction((id) => endRound(id), 'Failed to end round').catch(() => {});
	}

	function handleNextRound() {
		runAction((id) => startNextRound(id), 'Failed to start next round').catch(() => {});
	}

	function handleLeaveGame() {
		if (!confirm('Are you sure you want to leave? You may forfeit coins.')) return;

		runAction(
			async (id) => {
				await leaveGame(id);
				goto('/');
			},
			'Failed to leave game'
		).catch(() => {});
	}

	// Derived view state
	$: scores = game ? calculateScores(game) : { yourScore: 0, theirScore: 0 };
	$: moveAllowed = game ? canMakeMove(game) : false;
	$: boardPreview = moveAllowed ? { column: selfColumn, row: otherRow } : null;
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
		<GameHeader
			phase={game.phase}
			roundNumber={game.roundNumber}
			connectionStatus={$connectionStatus}
			disabled={actionLoading}
			on:leave={handleLeaveGame}
		/>

		{#if actionError}
			<div class="alert alert--error">{actionError}</div>
		{/if}

		<PlayersBar {game} />

		<Board {game} preview={boardPreview} />

		<div class="action-panel">
			{#if game.phase === 'waiting'}
				<WaitingState message="Waiting for opponent to join">
					<p class="game-id-display">
						Share this game ID: <code>{game.gameId}</code>
					</p>
				</WaitingState>
			{:else if isMovePhase(game.phase)}
				{#if moveAllowed}
					<MovePanel
						bind:selfColumn
						bind:otherRow
						loading={actionLoading}
						on:submit={handleMakeMove}
					/>
				{:else}
					<WaitingState message="Waiting for opponent's move" />
				{/if}
			{:else if isBettingPhase(game.phase)}
				{#if canMakeBet(game)}
					<BetPanel
						{game}
						bind:betAmount
						loading={actionLoading}
						on:bet={handleMakeBet}
						on:fold={handleFold}
					/>
				{:else}
					<WaitingState message="Waiting for opponent's bet" />
				{/if}
			{:else if game.phase === 'reveal'}
				{#if canReveal(game)}
					<RevealPanel
						columns={getChosenColumns(game)}
						bind:revealColumn
						loading={actionLoading}
						on:submit={handleReveal}
					/>
				{:else}
					<WaitingState message="Waiting for opponent to reveal" />
				{/if}
			{:else if game.phase === 'roundEnd'}
				<RoundEndPanel
					{scores}
					canEndRound={canEndRound(game)}
					canStartNextRound={canStartNextRound(game)}
					loading={actionLoading}
					on:endRound={handleEndRound}
					on:nextRound={handleNextRound}
				/>
			{:else if game.phase === 'ended'}
				<GameOverPanel yourCoins={game.yourCoins} theirCoins={game.theirCoins} />
			{:else}
				<WaitingState message="Waiting for opponent" />
			{/if}
		</div>

		<MoveHistory yourMoves={game.yourMoves} theirMoves={game.theirMoves} />
	</div>
{/if}

<style>
	.game-container {
		max-width: 900px;
	}

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
</style>
