<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { isAuthenticated, isLoading as authLoading, userId } from '$lib/auth';
	import {
		cancelGame,
		confirmFunding,
		endRound,
		foldBet,
		getGame,
		leaveGame,
		makeBet,
		makeMove,
		makeRevealMove,
		startNextRound
	} from '$lib/api';
	import {
		subscribe,
		unsubscribe,
		reconnect,
		gameState,
		connectionStatus,
		errorMessage,
		reconnectExhausted
	} from '$lib/websocket';
	import { config, txUrl } from '$lib/config';
	import {
		fundGameEscrow,
		toChainErrorMessage,
		type SealState,
		type StepReport
	} from '$lib/chain';
	import { unitsToUsdc, type GameStateView } from '@civil-sarabande/shared';
	import { isBettingPhase, isMovePhase } from '$lib/game/phases';
	import {
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
	import Seal from '$lib/components/game/Seal.svelte';
	import { panelIn, quickFade } from '$lib/motion';
	import type { Hash } from 'viem';

	let game: GameStateView | null = null;
	let loading = true;
	let actionError: string | null = null;
	let actionLoading = false;

	// Form state
	let selfColumn = 0;
	let otherRow = 0;
	let betAmount = 0;
	let revealColumn = 0;

	// ---- escrow funding (player 1, unfunded) ----------------------------------

	type FundStep = 'approve' | 'create' | 'confirm';
	interface StepView {
		label: string;
		state: SealState;
		detail: string;
		txHash: Hash | null;
	}
	const FUND_LABELS: Record<FundStep, string> = {
		approve: 'Approve USDC',
		create: 'Lock your stake',
		confirm: 'Seal with the house'
	};

	function freshFundSteps(): Record<FundStep, StepView> {
		return {
			approve: { label: FUND_LABELS.approve, state: 'pending', detail: '', txHash: null },
			create: { label: FUND_LABELS.create, state: 'pending', detail: '', txHash: null },
			confirm: { label: FUND_LABELS.confirm, state: 'pending', detail: '', txHash: null }
		};
	}

	let funding = false;
	let fundStarted = false;
	let fundSteps = freshFundSteps();
	let fundError: string | null = null;
	let cancelling = false;

	// ---- stores -------------------------------------------------------------

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

	let gameId = '';

	onMount(() => {
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
		gameId = $page.params.id ?? '';

		if (!gameId) {
			actionError = 'Invalid game ID';
			loading = false;
			return;
		}

		try {
			applyGame(await getGame(gameId));
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to load game';
			loading = false;
		}

		await subscribe(gameId);
	}

	/** Refetch the game from REST (used after deadlines and manual reconnects). */
	async function refetchGame() {
		if (!gameId) return;
		try {
			applyGame(await getGame(gameId));
		} catch (err) {
			console.warn('Refetch failed:', err);
		}
	}

	function applyGame(next: GameStateView) {
		game = next;
		loading = false;
		actionLoading = false;
	}

	onDestroy(() => {
		unsubGameState();
		unsubError();
		clearDeadlineTimers();
		if (gameId) {
			unsubscribe(gameId);
		}
	});

	// ---- actions ------------------------------------------------------------

	/**
	 * Run an action against the server and apply the returned view at once,
	 * without waiting for the socket broadcast.
	 */
	async function runAction(
		action: (gameId: string) => Promise<GameStateView | null | void>,
		failureMessage: string
	): Promise<void> {
		if (!game) return;
		actionError = null;
		actionLoading = true;

		try {
			const next = await action(game.gameId);
			if (next) {
				applyGame(next);
			} else {
				actionLoading = false;
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : failureMessage;
			actionLoading = false;
		}
	}

	function handleMakeMove() {
		void runAction((id) => makeMove(id, selfColumn, otherRow), 'Failed to make move');
	}

	function handleMakeBet() {
		void runAction(async (id) => {
			const next = await makeBet(id, betAmount);
			betAmount = 0;
			return next;
		}, 'Failed to place bet');
	}

	function handleFold() {
		void runAction((id) => foldBet(id), 'Failed to fold');
	}

	function handleReveal() {
		void runAction((id) => makeRevealMove(id, revealColumn), 'Failed to reveal');
	}

	function handleEndRound() {
		void runAction((id) => endRound(id), 'Failed to end round');
	}

	function handleNextRound() {
		void runAction((id) => startNextRound(id), 'Failed to start next round');
	}

	function handleLeaveGame() {
		if (!game) return;
		if (game.phase === 'ended') {
			goto('/');
			return;
		}
		if (game.phase === 'waiting' && game.yourRole === 'player1') {
			// Leaving an unjoined table is a cancel, which refunds the stake.
			void handleCancelGame();
			return;
		}
		if (!confirm('Are you sure you want to leave? You forfeit the leave penalty and the game ends.')) {
			return;
		}
		// Stay on the page: the game-over panel shows the settlement.
		void runAction((id) => leaveGame(id), 'Failed to leave game');
	}

	async function handleCancelGame() {
		if (!game || cancelling) return;
		const funded = game.escrow.status === 'funded';
		const prompt = funded
			? 'Cancel this table and refund your stake?'
			: 'Cancel this unfunded game?';
		if (!confirm(prompt)) return;

		cancelling = true;
		actionError = null;
		try {
			const next = await cancelGame(game.gameId);
			if (next && next.phase === 'ended') {
				applyGame(next);
			} else {
				// Unfunded games are deleted server-side; nothing to show here.
				await goto('/');
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Failed to cancel game';
		}
		cancelling = false;
	}

	// ---- escrow funding -------------------------------------------------------

	function applyFundReport(report: StepReport) {
		const key: FundStep = report.step === 'approve' ? 'approve' : 'create';
		fundSteps = {
			...fundSteps,
			[key]: {
				...fundSteps[key],
				state: report.state,
				detail: report.detail ?? '',
				txHash: report.txHash ?? fundSteps[key].txHash
			}
		};
	}

	async function handleFundEscrow() {
		if (!game || funding) return;
		funding = true;
		fundStarted = true;
		fundError = null;
		fundSteps = freshFundSteps();
		actionError = null;

		const target = game;
		try {
			const stakeUnits = BigInt(target.escrow.stakeUnits);
			const result = await fundGameEscrow(
				{
					serverGameId: target.gameId,
					contractGameId: target.escrow.contractGameId,
					stakeUnits
				},
				applyFundReport
			);

			fundSteps = {
				...fundSteps,
				confirm: { ...fundSteps.confirm, state: 'stamping', detail: 'Telling the server…' }
			};
			const confirmed = await confirmFunding(target.gameId, result.txHash ?? undefined);
			fundSteps = {
				...fundSteps,
				confirm: {
					...fundSteps.confirm,
					state: 'sealed',
					detail: `Escrow ${confirmed.escrow.status}`,
					txHash: result.txHash
				}
			};
			applyGame(confirmed);
		} catch (err) {
			const message = toChainErrorMessage(err);
			fundError = message;
			const open = (['approve', 'create', 'confirm'] as FundStep[]).find(
				(k) => fundSteps[k].state !== 'sealed'
			);
			if (open) {
				fundSteps = { ...fundSteps, [open]: { ...fundSteps[open], state: 'failed', detail: message } };
			}
		}
		funding = false;
	}

	// ---- turn deadline ----------------------------------------------------------

	// The visible countdown lives in GameHeader (deadline/yourTurn props). The
	// page keeps its own timer so that when the clock runs out it asks the
	// server what happened; the sweeper (every 5 s) decides the outcome.
	let deadlineTimers: ReturnType<typeof setTimeout>[] = [];
	let watchedDeadline: number | null = null;

	function clearDeadlineTimers() {
		for (const t of deadlineTimers) clearTimeout(t);
		deadlineTimers = [];
	}

	function watchDeadline(deadline: number | null) {
		if (deadline === watchedDeadline) return;
		watchedDeadline = deadline;
		clearDeadlineTimers();
		if (deadline === null) return;
		const untilExpiry = Math.max(0, deadline - Date.now());
		// Poll a little after expiry and again after the sweeper's interval.
		for (const extra of [1_000, 6_500, 12_000]) {
			deadlineTimers.push(setTimeout(() => void refetchGame(), untilExpiry + extra));
		}
	}

	$: watchDeadline(game ? game.phaseDeadline : null);

	function handleReconnect() {
		reconnect();
		void refetchGame();
	}

	// ---- derived view state -----------------------------------------------------

	$: isPlayer1 = game?.yourRole === 'player1';
	$: moveAllowed = game ? canMakeMove(game) : false;
	$: boardPreview = moveAllowed ? { column: selfColumn, row: otherRow } : null;
	$: escrowStatus = game?.escrow.status ?? null;
	$: stakeText = game ? `${unitsToUsdc(BigInt(game.escrow.stakeUnits || '0'))} USDC` : '';

	// Identifies which action panel is showing. When it changes, the panel
	// re-mounts and plays its entrance so every phase change has motion.
	$: panelKey = game
		? [game.phase, moveAllowed, canMakeBet(game), canReveal(game), escrowStatus].join(':')
		: '';
</script>

<svelte:head>
	<title>{game ? `Round ${game.roundNumber} · ${game.phase}` : 'Game'} - Civil Sarabande</title>
</svelte:head>

{#if loading && !game}
	<div class="loading">
		<div class="loading-spinner"></div>
		<p>Loading game...</p>
	</div>
{:else if !game}
	<div class="container">
		<div class="alert alert--error">{actionError ?? 'Game not found'}</div>
		<a href="/" class="btn-secondary">Return Home</a>
	</div>
{:else}
	<div class="container game-container" in:quickFade>
		<GameHeader
			phase={game.phase}
			roundNumber={game.roundNumber}
			connectionStatus={$connectionStatus}
			disabled={actionLoading || funding || cancelling}
			deadline={game.phaseDeadline}
			yourTurn={game.yourTurn}
			on:leave={handleLeaveGame}
		/>

		{#if $reconnectExhausted}
			<div class="alert alert--warning reconnect-bar" transition:quickFade>
				<span>Live updates are disconnected.</span>
				<button type="button" class="btn-secondary btn-sm" on:click={handleReconnect}>
					Reconnect
				</button>
			</div>
		{/if}

		{#if actionError}
			<div class="alert alert--error" transition:quickFade>{actionError}</div>
		{/if}

		<PlayersBar {game} />

		<Board {game} preview={boardPreview} />

		<div class="action-panel">
			{#key panelKey}
				<div class="panel-body" in:panelIn>
					{#if game.phase === 'waiting'}
						{#if escrowStatus === 'unfunded'}
							{#if isPlayer1}
								<h2>Fund the escrow</h2>
								<p class="panel-intro">
									Your table is open but your stake of <strong>{stakeText}</strong> is not in
									escrow yet. Nobody can join until it is.
								</p>
								{#if fundStarted}
									<ol class="seal-steps">
										{#each Object.entries(fundSteps) as [key, step] (key)}
											<li>
												<Seal
													state={step.state}
													label={step.label}
													detail={step.detail}
													href={txUrl(step.txHash)}
												/>
											</li>
										{/each}
									</ol>
								{/if}
								{#if fundError}
									<div class="alert alert--error">{fundError}</div>
								{/if}
								<div class="action-buttons">
									<button
										type="button"
										class="btn-gold btn-lg"
										on:click={handleFundEscrow}
										disabled={funding || cancelling}
									>
										{funding ? 'Sealing…' : fundStarted ? 'Retry funding' : 'Fund escrow'}
									</button>
									<button
										type="button"
										class="btn-danger"
										on:click={handleCancelGame}
										disabled={funding || cancelling}
									>
										{cancelling ? 'Cancelling…' : 'Cancel game'}
									</button>
								</div>
							{:else}
								<WaitingState message="Waiting for the host to fund the escrow" />
							{/if}
						{:else}
							<WaitingState message="Waiting for opponent to join">
								<p class="game-id-display">
									Share this game ID: <code>{game.gameId}</code>
								</p>
								<p class="escrow-line">
									<Seal state="sealed" label="Stake in escrow" detail={stakeText} />
								</p>
								{#if isPlayer1 && escrowStatus === 'funded'}
									<div class="action-buttons">
										<button
											type="button"
											class="btn-danger"
											on:click={handleCancelGame}
											disabled={cancelling}
										>
											{cancelling ? 'Cancelling…' : 'Cancel and refund'}
										</button>
									</div>
								{/if}
							</WaitingState>
						{/if}
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
							{game}
							canEndRound={canEndRound(game)}
							canStartNextRound={canStartNextRound(game)}
							loading={actionLoading}
							on:endRound={handleEndRound}
							on:nextRound={handleNextRound}
						/>
					{:else if game.phase === 'ended'}
						<GameOverPanel {game} explorerUrl={config.explorerUrl} />
					{:else}
						<WaitingState message="Waiting for opponent" />
					{/if}
				</div>
			{/key}
		</div>

		<MoveHistory yourMoves={game.yourMoves} theirMoves={game.theirMoves} />
	</div>
{/if}

<style>
	.game-container {
		max-width: 900px;
	}

	.reconnect-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
	}

	.panel-intro {
		color: var(--color-text-dim);
		margin-bottom: var(--space-md);
	}

	.panel-intro strong {
		color: var(--color-gold);
	}

	.seal-steps {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.escrow-line {
		margin-top: var(--space-md);
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
