<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createGame, listWaitingGames, joinGame } from '$lib/api';
	import { isAuthenticated, isLoading, onboardingStatus } from '$lib/auth';
	import { login, logout } from '$lib/privy';
	import type { WaitingGamesResponse } from '@civil-sarabande/shared';

	let stake = 1;
	let waitingGames: WaitingGamesResponse['games'] = [];
	let loading = false;
	let error: string | null = null;
	let checkingUser = true;

	onMount(async () => {
		await refreshWaitingGames();
	});

	// Check user status when authenticated
	$: if ($isAuthenticated && !$isLoading) {
		checkUserStatus();
	}

	async function checkUserStatus() {
		checkingUser = true;
		try {
			const { getAccessToken } = await import('$lib/privy');
			const token = await getAccessToken();

			if (!token) {
				checkingUser = false;
				return;
			}

			const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
			const response = await fetch(`${API_URL}/users/me`, {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				checkingUser = false;
				return;
			}

			const data = await response.json();

			if (data.user.needsUsername) {
				onboardingStatus.set({
					needsUsername: true,
					username: null,
					isLoading: false
				});
				goto('/onboarding');
			} else {
				onboardingStatus.set({
					needsUsername: false,
					username: data.user.username,
					isLoading: false
				});
			}
		} catch (err) {
			console.error('Failed to check user status:', err);
		}
		checkingUser = false;
	}

	async function refreshWaitingGames() {
		try {
			waitingGames = await listWaitingGames();
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load waiting games';
		}
	}

	async function handleCreateGame() {
		if (!$isAuthenticated) {
			error = 'Please sign in to create a game';
			return;
		}

		if (stake <= 0) {
			error = 'Stake must be greater than 0';
			return;
		}

		loading = true;
		error = null;

		try {
			const game = await createGame(stake);
			goto(`/game/${game.gameId}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create game';
			loading = false;
		}
	}

	async function handleJoinGame(gameId: string) {
		if (!$isAuthenticated) {
			error = 'Please sign in to join a game';
			return;
		}

		loading = true;
		error = null;

		try {
			const game = await joinGame(gameId);
			goto(`/game/${game.gameId}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join game';
			loading = false;
		}
	}

	async function handleLogout() {
		await logout();
		onboardingStatus.set({
			needsUsername: false,
			username: null,
			isLoading: false
		});
	}
</script>

<svelte:head>
	<title>Civil Sarabande</title>
</svelte:head>

<div class="container">
	<header class="home-header">
		<h1>Civil Sarabande</h1>
		<p class="subtitle">A game of numbers, nerves, and nuance</p>
	</header>

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
			<p>Sign in to create or join games.</p>
			<button type="button" on:click={login} class="btn-gold btn-lg">Sign In</button>
		</div>
	{:else}
		<div class="user-bar">
			<div class="user-info">
				Signed in as <strong>{$onboardingStatus.username || 'Loading...'}</strong>
			</div>
			<button type="button" on:click={handleLogout} class="btn-secondary btn-sm">Sign Out</button>
		</div>

		<div class="grid grid--2col">
			<!-- Create Game Panel -->
			<div class="card">
				<h2>Create Game</h2>
				<form on:submit|preventDefault={handleCreateGame}>
					<div class="form-group">
						<label for="stake">Stake (USDC)</label>
						<input
							type="number"
							id="stake"
							bind:value={stake}
							min="1"
							required
							disabled={loading}
						/>
					</div>
					<button type="submit" class="btn-primary btn-lg" disabled={loading}>
						{loading ? 'Creating...' : 'Create Game'}
					</button>
				</form>
			</div>

			<!-- Waiting Games Panel -->
			<div class="card">
				<div class="card-header">
					<h2>Open Games</h2>
					<button 
						type="button" 
						class="btn-secondary btn-sm" 
						on:click={refreshWaitingGames} 
						disabled={loading}
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
						{#each waitingGames as game}
							<div class="game-item">
								<div class="game-item-info">
									<span class="game-item-id">{game.gameId.slice(0, 20)}...</span>
									<span class="game-item-player">
										Hosted by <strong>{game.player1.name || 'Unknown'}</strong>
									</span>
									<span class="game-item-stake">Stake: {game.stake} USDC</span>
								</div>
								<button
									type="button"
									class="btn-gold"
									on:click={() => handleJoinGame(game.gameId)}
									disabled={loading}
								>
									Join
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- How to Play -->
	<div class="card how-to-play">
		<h2>How to Play</h2>
		<div class="rules-grid">
			<div class="rule">
				<span class="rule-num">1</span>
				<div>
					<strong>Choose Columns</strong>
					<p>Pick columns for yourself to determine which cells score for you.</p>
				</div>
			</div>
			<div class="rule">
				<span class="rule-num">2</span>
				<div>
					<strong>Assign Rows</strong>
					<p>Assign rows to your opponent, determining which cells score for them.</p>
				</div>
			</div>
			<div class="rule">
				<span class="rule-num">3</span>
				<div>
					<strong>Place Bets</strong>
					<p>Between each move, bet on your hand. Call, raise, or fold.</p>
				</div>
			</div>
			<div class="rule">
				<span class="rule-num">4</span>
				<div>
					<strong>Reveal & Score</strong>
					<p>Reveal one column to score. Highest total wins the pot.</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.home-header {
		text-align: center;
		margin-bottom: var(--space-2xl);
	}

	.subtitle {
		color: var(--color-text-dim);
		font-style: italic;
		font-size: 1.1rem;
	}

	.auth-section {
		text-align: center;
		max-width: 400px;
		margin: 0 auto var(--space-2xl) auto;
	}

	.auth-section p {
		color: var(--color-text-dim);
		margin-bottom: var(--space-lg);
	}

	.user-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
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

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-md);
	}

	.card-header h2 {
		margin-bottom: 0;
		border-bottom: none;
		padding-bottom: 0;
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

	.rules-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-lg);
	}

	.rule {
		display: flex;
		gap: var(--space-md);
		align-items: flex-start;
	}

	.rule-num {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-primary-dark);
		color: var(--color-gold);
		border-radius: 50%;
		font-family: var(--font-display);
		font-weight: 700;
	}

	.rule p {
		margin: var(--space-xs) 0 0 0;
		color: var(--color-text-dim);
		font-size: 0.9rem;
	}
</style>
