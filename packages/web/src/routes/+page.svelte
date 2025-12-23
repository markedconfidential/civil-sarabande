<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createGame, listWaitingGames } from '$lib/api';
	import { setPlayerName } from '$lib/player';
	import type { WaitingGamesResponse } from '@civil-sarabande/shared';

	let playerName = '';
	let stake = 1;
	let waitingGames: WaitingGamesResponse['games'] = [];
	let loading = false;
	let error: string | null = null;

	onMount(async () => {
		await refreshWaitingGames();
	});

	async function refreshWaitingGames() {
		try {
			waitingGames = await listWaitingGames();
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load waiting games';
		}
	}

	async function handleCreateGame() {
		if (!playerName.trim()) {
			error = 'Player name is required';
			return;
		}

		if (stake <= 0) {
			error = 'Stake must be greater than 0';
			return;
		}

		loading = true;
		error = null;

		try {
			setPlayerName(playerName.trim());
			const game = await createGame(playerName.trim(), stake);
			goto(`/game/${game.gameId}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create game';
			loading = false;
		}
	}

	async function handleJoinGame(gameId: string) {
		if (!playerName.trim()) {
			error = 'Player name is required';
			return;
		}

		loading = true;
		error = null;

		try {
			setPlayerName(playerName.trim());
			const game = await joinGame(gameId, playerName.trim());
			goto(`/game/${game.gameId}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join game';
			loading = false;
		}
	}
</script>

<div>
	<h1>Civil Sarabande</h1>

	<div>
		<h2>Create Game</h2>
		<form on:submit|preventDefault={handleCreateGame}>
			<div>
				<label for="playerName">Player Name:</label>
				<input
					type="text"
					id="playerName"
					bind:value={playerName}
					required
					disabled={loading}
				/>
			</div>
			<div>
				<label for="stake">Stake:</label>
				<input
					type="number"
					id="stake"
					bind:value={stake}
					min="1"
					required
					disabled={loading}
				/>
			</div>
			<button type="submit" disabled={loading}>Create Game</button>
		</form>
	</div>

	<div>
		<h2>Waiting Games</h2>
		<button type="button" on:click={refreshWaitingGames} disabled={loading}>
			Refresh
		</button>

		{#if error}
			<div>Error: {error}</div>
		{/if}

		{#if waitingGames.length === 0}
			<div>No games waiting for players</div>
		{:else}
			<div>
				{#each waitingGames as game}
					<div>
						<div>
							Game ID: {game.gameId}
							<br />
							Player: {game.player1.name || 'Unknown'}
							<br />
							Stake: {game.stake}
						</div>
						<button
							type="button"
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

