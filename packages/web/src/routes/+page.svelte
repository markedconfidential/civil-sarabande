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
	<h1>Civil Sarabande</h1>

	{#if $isLoading || checkingUser}
		<p>Loading...</p>
	{:else if !$isAuthenticated}
		<div class="auth-section">
			<p>Sign in to create or join games.</p>
			<button type="button" on:click={login} class="primary-button"> Sign In </button>
		</div>
	{:else}
		<div class="user-info">
			<p>
				Signed in as <strong>{$onboardingStatus.username || 'Loading...'}</strong>
			</p>
			<button type="button" on:click={handleLogout} class="secondary-button"> Sign Out </button>
		</div>

		<div class="section">
			<h2>Create Game</h2>
			<form on:submit|preventDefault={handleCreateGame}>
				<div class="input-group">
					<label for="stake">Stake (USDC):</label>
					<input
						type="number"
						id="stake"
						bind:value={stake}
						min="1"
						required
						disabled={loading}
					/>
				</div>
				<button type="submit" class="primary-button" disabled={loading}>
					{loading ? 'Creating...' : 'Create Game'}
				</button>
			</form>
		</div>
	{/if}

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<div class="section">
		<h2>Waiting Games</h2>
		<button type="button" on:click={refreshWaitingGames} disabled={loading} class="secondary-button">
			Refresh
		</button>

		{#if waitingGames.length === 0}
			<p>No games waiting for players</p>
		{:else}
			<div class="games-list">
				{#each waitingGames as game}
					<div class="game-card">
						<div class="game-info">
							<span class="game-id">{game.gameId.slice(0, 12)}...</span>
							<span class="player-name">Created by: {game.player1.name || 'Unknown'}</span>
							<span class="stake">Stake: {game.stake} USDC</span>
						</div>
						{#if $isAuthenticated}
							<button
								type="button"
								on:click={() => handleJoinGame(game.gameId)}
								disabled={loading}
								class="primary-button"
							>
								Join
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.container {
		max-width: 600px;
		margin: 2rem auto;
		padding: 1rem;
	}

	h1 {
		text-align: center;
		margin-bottom: 2rem;
	}

	.auth-section {
		text-align: center;
		margin: 2rem 0;
	}

	.user-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 8px;
		margin-bottom: 2rem;
	}

	.section {
		margin: 2rem 0;
	}

	.input-group {
		margin: 1rem 0;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: bold;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}

	.primary-button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: bold;
		color: white;
		background-color: #7c3aed;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.primary-button:hover:not(:disabled) {
		background-color: #6d28d9;
	}

	.primary-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.secondary-button {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		color: #333;
		background-color: #e5e5e5;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.secondary-button:hover:not(:disabled) {
		background-color: #d4d4d4;
	}

	.error {
		color: #ef4444;
		margin: 1rem 0;
		padding: 0.75rem;
		background: #fef2f2;
		border-radius: 4px;
	}

	.games-list {
		margin-top: 1rem;
	}

	.game-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		margin-bottom: 0.5rem;
	}

	.game-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.game-id {
		font-family: monospace;
		font-size: 0.875rem;
		color: #666;
	}

	.player-name {
		font-weight: bold;
	}

	.stake {
		color: #22c55e;
		font-weight: bold;
	}
</style>
