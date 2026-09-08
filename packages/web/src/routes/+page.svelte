<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		confirmFunding,
		createGame,
		faucet,
		getConfig,
		getGame,
		getMe,
		getMyGame,
		joinGame,
		listWaitingGames
	} from '$lib/api';
	import {
		isAuthenticated,
		isLoading,
		onboardingStatus,
		resetOnboardingStatus,
		userId,
		walletAddress
	} from '$lib/auth';
	import { login, logout } from '$lib/privy';
	import { chainName, config, configErrors, txUrl } from '$lib/config';
	import {
		fundGameEscrow,
		getUsdcBalance,
		joinGameEscrow,
		toChainErrorMessage,
		type SealState,
		type StepReport
	} from '$lib/chain';
	import { DEV_FAUCET_AMOUNT } from '$lib/dev/login';
	import { unitsToUsdc, usdcToUnits, type GameStateView, type WaitingGamesResponse } from '@civil-sarabande/shared';
	import Seal from '$lib/components/game/Seal.svelte';
	import { panelIn, quickFade } from '$lib/motion';
	import type { Address, Hash } from 'viem';

	const isDev = config.authMode === 'dev';

	// ---- lobby state --------------------------------------------------------

	let stakeInput = '1';
	let waitingGames: WaitingGamesResponse['games'] = [];
	let myGame: GameStateView | null = null;
	let error: string | null = null;
	let checkingUser = false;
	let userChecked = false;

	// ---- wallet -------------------------------------------------------------

	let balanceUnits: bigint | null = null;
	let balanceError: string | null = null;
	let loadingBalance = false;
	let fauceting = false;

	// ---- server/client config agreement ------------------------------------

	let configWarnings: string[] = [];

	// ---- create flow --------------------------------------------------------

	type CreateStep = 'server' | 'approve' | 'create' | 'confirm';
	interface StepView {
		label: string;
		state: SealState;
		detail: string;
		txHash: Hash | null;
	}

	const CREATE_LABELS: Record<CreateStep, string> = {
		server: 'Open the table',
		approve: 'Approve USDC',
		create: 'Lock your stake',
		confirm: 'Seal with the house'
	};

	function freshSteps<K extends string>(labels: Record<K, string>): Record<K, StepView> {
		const out = {} as Record<K, StepView>;
		for (const key of Object.keys(labels) as K[]) {
			out[key] = { label: labels[key], state: 'pending', detail: '', txHash: null };
		}
		return out;
	}

	let creating = false;
	let createActive = false;
	let createSteps = freshSteps(CREATE_LABELS);
	let createError: string | null = null;
	let createdGame: GameStateView | null = null;

	// ---- join flow ----------------------------------------------------------

	type JoinStep = 'approve' | 'join' | 'server';
	const JOIN_LABELS: Record<JoinStep, string> = {
		approve: 'Approve USDC',
		join: 'Lock your stake',
		server: 'Take your seat'
	};

	let joiningGameId: string | null = null;
	let joinBusy = false;
	let joinSteps = freshSteps(JOIN_LABELS);
	let joinError: string | null = null;

	$: busy = creating || joinBusy || fauceting;

	// ---- lifecycle ----------------------------------------------------------

	onMount(async () => {
		await Promise.all([refreshWaitingGames(), checkServerConfig()]);
	});

	// When auth settles, load everything that needs a signed-in user.
	$: if ($isAuthenticated && !$isLoading) {
		if (!userChecked) {
			userChecked = true;
			checkUserStatus();
			loadMyGame();
		}
	} else if (!$isAuthenticated) {
		userChecked = false;
		checkingUser = false;
		myGame = null;
		balanceUnits = null;
	}

	$: if ($isAuthenticated && $walletAddress && !$isLoading) {
		refreshBalance($walletAddress);
	}

	async function checkServerConfig() {
		try {
			const server = await getConfig();
			const warnings: string[] = [];
			if (server.chainId !== config.chainId) {
				warnings.push(`Chain: server is on ${chainName(server.chainId)}, client on ${chainName()}.`);
			}
			if (server.escrowAddress.toLowerCase() !== config.escrowAddress.toLowerCase()) {
				warnings.push(`Escrow contract: server ${server.escrowAddress}, client ${config.escrowAddress}.`);
			}
			if (server.usdcAddress.toLowerCase() !== config.usdcAddress.toLowerCase()) {
				warnings.push(`USDC contract: server ${server.usdcAddress}, client ${config.usdcAddress}.`);
			}
			if (server.authMode !== config.authMode) {
				warnings.push(`Auth mode: server "${server.authMode}", client "${config.authMode}".`);
			}
			if (warnings.length > 0) {
				console.warn('Client/server configuration mismatch:', warnings);
			}
			configWarnings = warnings;
		} catch (err) {
			console.warn('Could not fetch server config:', err);
		}
	}

	async function checkUserStatus() {
		checkingUser = true;
		try {
			const me = await getMe();
			if (me.needsUsername) {
				onboardingStatus.set({ needsUsername: true, username: null, isLoading: false });
				goto('/onboarding');
			} else {
				onboardingStatus.set({ needsUsername: false, username: me.username, isLoading: false });
			}
		} catch (err) {
			console.error('Failed to check user status:', err);
		}
		checkingUser = false;
	}

	async function loadMyGame() {
		try {
			myGame = await getMyGame();
		} catch (err) {
			// A 404 just means the server is older than this client; not fatal.
			console.warn('Could not load current game:', err);
			myGame = null;
		}
	}

	async function refreshWaitingGames() {
		try {
			waitingGames = await listWaitingGames();
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load waiting games';
		}
	}

	async function refreshBalance(address: string) {
		loadingBalance = true;
		balanceError = null;
		try {
			balanceUnits = await getUsdcBalance(address as Address);
		} catch (err) {
			balanceError = toChainErrorMessage(err);
		}
		loadingBalance = false;
	}

	async function requestFaucet() {
		if (!$walletAddress || fauceting) return;
		fauceting = true;
		balanceError = null;
		try {
			await faucet($walletAddress, DEV_FAUCET_AMOUNT);
			await refreshBalance($walletAddress);
		} catch (err) {
			balanceError = err instanceof Error ? err.message : 'Faucet failed';
		}
		fauceting = false;
	}

	// ---- stake validation ---------------------------------------------------

	function parseStake(): bigint {
		const text = stakeInput.trim();
		let units: bigint;
		try {
			units = usdcToUnits(text);
		} catch (err) {
			throw new Error(
				/decimal/i.test(err instanceof Error ? err.message : '')
					? 'Stake supports at most 6 decimal places.'
					: 'Enter a stake like 1 or 2.5 (USDC).'
			);
		}
		if (units <= 0n) throw new Error('Stake must be greater than 0.');
		if (balanceUnits !== null && units > balanceUnits) {
			throw new Error(`Stake exceeds your balance of ${unitsToUsdc(balanceUnits)} USDC.`);
		}
		return units;
	}

	// ---- create -------------------------------------------------------------

	function setStep<T extends Record<string, StepView>>(
		steps: T,
		key: keyof T,
		patch: Partial<StepView>
	): T {
		return { ...steps, [key]: { ...steps[key], ...patch } };
	}

	function applyReport(report: StepReport) {
		const key: CreateStep = report.step === 'approve' ? 'approve' : 'create';
		createSteps = setStep(createSteps, key, {
			state: report.state,
			detail: report.detail ?? '',
			txHash: report.txHash ?? createSteps[key].txHash
		});
	}

	async function handleCreateGame() {
		if (!$isAuthenticated) {
			error = 'Please sign in to create a game';
			return;
		}
		if (busy) return;

		let stakeUnits: bigint;
		try {
			stakeUnits = parseStake();
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Invalid stake';
			createActive = true;
			return;
		}

		creating = true;
		createActive = true;
		createError = null;
		createSteps = freshSteps(CREATE_LABELS);
		createdGame = null;

		// 1. Server game record
		createSteps = setStep(createSteps, 'server', { state: 'stamping', detail: 'Creating game…' });
		try {
			createdGame = await createGame(Number(stakeInput.trim()));
			createSteps = setStep(createSteps, 'server', {
				state: 'sealed',
				detail: `Game ${createdGame.gameId.slice(0, 8)}…`
			});
		} catch (err) {
			createSteps = setStep(createSteps, 'server', {
				state: 'failed',
				detail: err instanceof Error ? err.message : 'Failed to create game'
			});
			createError = err instanceof Error ? err.message : 'Failed to create game';
			creating = false;
			return;
		}

		await fundCreatedGame(createdGame, stakeUnits);
	}

	/** Steps 2–4: approve → createGame → confirm-funding. */
	async function fundCreatedGame(game: GameStateView, stakeUnits: bigint) {
		creating = true;
		createError = null;
		try {
			const result = await fundGameEscrow(
				{ serverGameId: game.gameId, contractGameId: game.escrow.contractGameId, stakeUnits },
				applyReport
			);

			createSteps = setStep(createSteps, 'confirm', {
				state: 'stamping',
				detail: 'Telling the server…'
			});
			const confirmed = await confirmFunding(game.gameId, result.txHash ?? undefined);
			createSteps = setStep(createSteps, 'confirm', {
				state: 'sealed',
				detail: `Escrow ${confirmed.escrow.status}`
			});
			await goto(`/game/${game.gameId}`);
		} catch (err) {
			const message = toChainErrorMessage(err);
			createError = message;
			// Mark whichever step is still open as the failure point.
			const open = (['approve', 'create', 'confirm'] as CreateStep[]).find(
				(k) => createSteps[k].state !== 'sealed'
			);
			if (open) createSteps = setStep(createSteps, open, { state: 'failed', detail: message });
			creating = false;
			// The server game exists: the game page carries the "Fund escrow" retry.
			await goto(`/game/${game.gameId}`);
		}
	}

	async function retryCreate() {
		if (createdGame) {
			let stakeUnits: bigint;
			try {
				stakeUnits = BigInt(createdGame.escrow.stakeUnits);
			} catch {
				stakeUnits = usdcToUnits(createdGame.stake);
			}
			createSteps = setStep(createSteps, 'approve', { state: 'pending', detail: '' });
			createSteps = setStep(createSteps, 'create', { state: 'pending', detail: '' });
			createSteps = setStep(createSteps, 'confirm', { state: 'pending', detail: '' });
			await fundCreatedGame(createdGame, stakeUnits);
		} else {
			await handleCreateGame();
		}
	}

	function dismissCreate() {
		createActive = false;
		createError = null;
		createSteps = freshSteps(CREATE_LABELS);
		createdGame = null;
	}

	// ---- join ---------------------------------------------------------------

	function applyJoinReport(report: StepReport) {
		const key: JoinStep = report.step === 'approve' ? 'approve' : 'join';
		joinSteps = setStep(joinSteps, key, {
			state: report.state,
			detail: report.detail ?? '',
			txHash: report.txHash ?? joinSteps[key].txHash
		});
	}

	async function handleJoinGame(gameId: string) {
		if (!$isAuthenticated) {
			error = 'Please sign in to join a game';
			return;
		}
		if (busy) return;

		joinBusy = true;
		joiningGameId = gameId;
		joinError = null;
		joinSteps = freshSteps(JOIN_LABELS);

		try {
			// The lobby list has no contract id; the game view does.
			const game = await getGame(gameId);
			if (game.player1.id === $userId) {
				throw new Error('You cannot join your own game.');
			}
			const stakeUnits = BigInt(game.escrow.stakeUnits);
			if (balanceUnits !== null && stakeUnits > balanceUnits) {
				throw new Error(
					`This table's stake is ${unitsToUsdc(stakeUnits)} USDC; you hold ${unitsToUsdc(balanceUnits)}.`
				);
			}

			const result = await joinGameEscrow(
				{ contractGameId: game.escrow.contractGameId, stakeUnits },
				applyJoinReport
			);

			joinSteps = setStep(joinSteps, 'server', { state: 'stamping', detail: 'Taking your seat…' });
			const joined = await joinGame(gameId, result.txHash ?? undefined);
			joinSteps = setStep(joinSteps, 'server', { state: 'sealed', detail: 'Seated' });
			await goto(`/game/${joined.gameId}`);
		} catch (err) {
			const message = toChainErrorMessage(err);
			joinError = message;
			const open = (['approve', 'join', 'server'] as JoinStep[]).find(
				(k) => joinSteps[k].state !== 'sealed'
			);
			if (open) joinSteps = setStep(joinSteps, open, { state: 'failed', detail: message });
			joinBusy = false;
		}
	}

	function dismissJoin() {
		joiningGameId = null;
		joinError = null;
		joinSteps = freshSteps(JOIN_LABELS);
	}

	async function handleLogout() {
		await logout();
		resetOnboardingStatus();
	}

	$: balanceText =
		balanceUnits === null ? (loadingBalance ? 'Loading…' : '—') : `${unitsToUsdc(balanceUnits)} USDC`;
</script>

<svelte:head>
	<title>Civil Sarabande</title>
</svelte:head>

<div class="container">
	<header class="page-header">
		<h1>Civil Sarabande</h1>
		<p class="page-subtitle">A game of numbers, nerves, and nuance</p>
	</header>

	{#if configErrors.length > 0}
		<div class="card config-card">
			<h2>Configuration problems</h2>
			<p class="card-intro">
				The client cannot reach the chain until these are fixed in <code>packages/web/.env</code>
				(see <code>.env.example</code>).
			</p>
			<ul class="problem-list">
				{#each configErrors as problem}
					<li class="alert alert--error">{problem}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if configWarnings.length > 0}
		<div class="card config-card">
			<h2>Client and server disagree</h2>
			<p class="card-intro">
				The server's <code>/config</code> does not match this client's environment. Transactions
				will likely fail until both sides point at the same chain and contracts.
			</p>
			<ul class="problem-list">
				{#each configWarnings as warning}
					<li class="alert alert--warning">{warning}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if error}
		<div class="alert alert--error">{error}</div>
	{/if}

	{#if $isLoading || checkingUser}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading...</p>
		</div>
	{:else if !$isAuthenticated}
		<div class="auth-section card">
			<h2>Welcome</h2>
			<p>Sign in only to create or join a game. Browsing open games is always available.</p>
			<button type="button" on:click={login} class="btn-gold btn-lg">
				{isDev ? 'Choose a dev identity' : 'Sign In'}
			</button>
		</div>

		<!-- Waiting Games Panel (unauthenticated) -->
		<div class="card">
			<div class="card-header">
				<h2>Open Games</h2>
				<button type="button" class="btn-secondary btn-sm" on:click={refreshWaitingGames}>
					Refresh
				</button>
			</div>

			{#if waitingGames.length === 0}
				<div class="empty-state">
					<p>No games waiting for players</p>
					<p class="text-muted">Create a game or check back later</p>
				</div>
			{:else}
				<div class="game-list">
					{#each waitingGames as game}
						<div class="game-item">
							<div class="game-item-info">
								<span class="game-item-id">{game.gameId.slice(0, 20)}...</span>
								<span class="game-item-player">
									Hosted by <strong>{game.player1.name || 'Unknown'}</strong>
								</span>
								<span class="game-item-stake">Stake: {game.stake} USDC</span>
							</div>
							<button type="button" class="btn-gold" on:click={login}>Sign in to join</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div class="user-bar">
			<div class="user-info">
				Signed in as <strong>{$onboardingStatus.username || 'Loading...'}</strong>
				{#if $walletAddress}
					<span class="user-wallet" title={$walletAddress}>
						{$walletAddress.slice(0, 6)}…{$walletAddress.slice(-4)}
					</span>
				{/if}
			</div>
			<div class="user-actions">
				<a href="/funding" class="btn-secondary btn-sm">Wallet</a>
				<button type="button" on:click={handleLogout} class="btn-secondary btn-sm">Sign Out</button>
			</div>
		</div>

		{#if myGame}
			<div class="card resume-card" in:panelIn>
				<div class="card-header">
					<h2>Your table is waiting</h2>
					<span class="resume-meta">
						Round {myGame.roundNumber} · {myGame.phase} · escrow {myGame.escrow.status}
					</span>
				</div>
				<p class="card-intro">
					You have an unfinished game against
					<strong>
						{(myGame.yourRole === 'player1' ? myGame.player2?.name : myGame.player1.name) ||
							'nobody yet'}
					</strong>
					for {myGame.stake} USDC.
				</p>
				<a href={`/game/${myGame.gameId}`} class="btn-gold btn-lg">Resume game</a>
			</div>
		{/if}

		<div class="grid grid--2col">
			<!-- Create Game Panel -->
			<div class="card">
				<h2>Create Game</h2>
				<form on:submit|preventDefault={handleCreateGame}>
					<div class="form-group">
						<label for="stake">Stake (USDC per player)</label>
						<input
							type="text"
							inputmode="decimal"
							id="stake"
							bind:value={stakeInput}
							placeholder="1"
							required
							disabled={busy}
						/>
						<p class="field-hint balance-line">
							Your balance:
							<strong class:balance-low={balanceUnits !== null && balanceUnits === 0n}>
								{balanceText}
							</strong>
							{#if balanceError}
								<span class="field-status field-status--error">{balanceError}</span>
							{/if}
							{#if isDev && $walletAddress}
								<button
									type="button"
									class="btn-secondary btn-sm"
									on:click={requestFaucet}
									disabled={fauceting}
								>
									{fauceting ? 'Minting…' : `Faucet +${DEV_FAUCET_AMOUNT}`}
								</button>
							{/if}
						</p>
					</div>
					<button type="submit" class="btn-primary btn-lg" disabled={busy || !$walletAddress}>
						{creating ? 'Opening the table…' : 'Create Game'}
					</button>
				</form>

				{#if createActive}
					<div class="steps-panel" transition:quickFade>
						<ol class="seal-steps">
							{#each Object.entries(createSteps) as [key, step] (key)}
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
						{#if createError}
							<div class="alert alert--error">{createError}</div>
							<div class="step-actions">
								<button type="button" class="btn-primary" on:click={retryCreate} disabled={busy}>
									Retry
								</button>
								{#if createdGame}
									<a href={`/game/${createdGame.gameId}`} class="btn-secondary">Open game</a>
								{/if}
								<button type="button" class="btn-secondary" on:click={dismissCreate} disabled={busy}>
									Dismiss
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Waiting Games Panel (authenticated) -->
			<div class="card">
				<div class="card-header">
					<h2>Open Games</h2>
					<button
						type="button"
						class="btn-secondary btn-sm"
						on:click={refreshWaitingGames}
						disabled={busy}
					>
						Refresh
					</button>
				</div>

				{#if waitingGames.length === 0}
					<div class="empty-state">
						<p>No games waiting for players</p>
						<p class="text-muted">Create a game or check back later</p>
					</div>
				{:else}
					<div class="game-list">
						{#each waitingGames as game (game.gameId)}
							{@const mine = game.player1.id === $userId}
							<div class="game-item" class:game-item--mine={mine}>
								<div class="game-item-info">
									<span class="game-item-id">{game.gameId.slice(0, 20)}...</span>
									<span class="game-item-player">
										Hosted by <strong>{mine ? 'you' : game.player1.name || 'Unknown'}</strong>
									</span>
									<span class="game-item-stake">Stake: {game.stake} USDC</span>
								</div>
								{#if mine}
									<a href={`/game/${game.gameId}`} class="btn-secondary">Open</a>
								{:else}
									<button
										type="button"
										class="btn-gold"
										on:click={() => handleJoinGame(game.gameId)}
										disabled={busy}
										title={mine ? 'This is your own game' : ''}
									>
										{joiningGameId === game.gameId && joinBusy ? 'Joining…' : 'Join'}
									</button>
								{/if}
							</div>
							{#if joiningGameId === game.gameId}
								<div class="steps-panel" transition:quickFade>
									<ol class="seal-steps">
										{#each Object.entries(joinSteps) as [key, step] (key)}
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
									{#if joinError}
										<div class="alert alert--error">{joinError}</div>
										<div class="step-actions">
											<button
												type="button"
												class="btn-primary"
												on:click={() => handleJoinGame(game.gameId)}
												disabled={busy}
											>
												Retry
											</button>
											<button type="button" class="btn-secondary" on:click={dismissJoin} disabled={busy}>
												Dismiss
											</button>
										</div>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- How to Play -->
	<div class="card how-to-play">
		<h2>How to Play</h2>
		<div class="steps steps--grid">
			<div class="step">
				<span class="step-num">1</span>
				<div>
					<strong>Stake USDC</strong>
					<p>Both players lock the same stake in escrow. Your 100 coins are that stake.</p>
				</div>
			</div>
			<div class="step">
				<span class="step-num">2</span>
				<div>
					<strong>Choose Columns, Assign Rows</strong>
					<p>Pick columns for yourself; assign rows to your opponent. Their columns stay hidden.</p>
				</div>
			</div>
			<div class="step">
				<span class="step-num">3</span>
				<div>
					<strong>Place Bets</strong>
					<p>Between each move, bet on your hand. Call, raise, or fold.</p>
				</div>
			</div>
			<div class="step">
				<span class="step-num">4</span>
				<div>
					<strong>Reveal & Settle</strong>
					<p>Reveal one column to score. When a player is out of coins, escrow pays out by coins held.</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.auth-section {
		text-align: center;
		max-width: 400px;
		margin: 0 auto var(--space-2xl) auto;
	}

	.auth-section p {
		color: var(--color-text-dim);
		margin-bottom: var(--space-lg);
	}

	.card-intro {
		color: var(--color-text-dim);
		margin-bottom: var(--space-md);
	}

	.config-card {
		border-color: var(--color-error);
	}

	.problem-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.problem-list li {
		margin-bottom: var(--space-sm);
	}

	.user-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		background: var(--color-bg-card);
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-lg);
		margin-bottom: var(--space-xl);
	}

	.user-info {
		color: var(--color-text-dim);
	}

	.user-info strong {
		color: var(--color-gold);
	}

	.user-wallet {
		margin-left: var(--space-sm);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.user-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.resume-card {
		margin-bottom: var(--space-xl);
		border-color: var(--color-gold-dim);
	}

	.resume-meta {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
		margin-bottom: var(--space-md);
	}

	.card-header h2 {
		margin-bottom: 0;
		border-bottom: none;
		padding-bottom: 0;
	}

	.balance-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}

	.balance-line strong {
		color: var(--color-gold);
	}

	.balance-low {
		color: var(--color-error) !important;
	}

	.steps-panel {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-cell-border);
	}

	.seal-steps {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.step-actions {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.game-item--mine {
		opacity: 0.85;
	}

	.empty-state {
		text-align: center;
		padding: var(--space-xl) var(--space-md);
		color: var(--color-text-dim);
	}

	.empty-state .text-muted {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}

	.how-to-play {
		margin-top: var(--space-lg);
	}
</style>
