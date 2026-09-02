<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { GameStateView } from '@civil-sarabande/shared';
	import { canFold, getAmountToCall } from '$lib/game/selectors';

	export let game: GameStateView;
	export let betAmount = 0;
	export let loading = false;

	const dispatch = createEventDispatcher<{ bet: void; fold: void }>();

	$: amountToCall = getAmountToCall(game);
	$: foldAllowed = canFold(game);
	$: submitLabel = betAmount === 0 ? 'Check' : betAmount <= amountToCall ? 'Call' : 'Raise';
</script>

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

<form on:submit|preventDefault={() => dispatch('bet')} class="bet-form">
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
		<button type="submit" class="btn-primary" disabled={loading}>
			{submitLabel}
		</button>
		{#if foldAllowed}
			<button type="button" class="btn-danger" on:click={() => dispatch('fold')} disabled={loading}>
				Fold
			</button>
		{/if}
	</div>
</form>

<style>
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

	@media (max-width: 600px) {
		.betting-info {
			flex-direction: column;
		}
	}
</style>
