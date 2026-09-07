<script lang="ts">
	import type { GameStateView } from '@civil-sarabande/shared';
	import { popIn } from '$lib/motion';
	import PlayerSigil from '$lib/components/art/PlayerSigil.svelte';
	import CoinStack from '$lib/components/art/CoinStack.svelte';

	export let game: GameStateView;

	$: isPlayer1 = game.yourRole === 'player1';
	$: you = isPlayer1 ? game.player1 : game.player2;
	$: them = isPlayer1 ? game.player2 : game.player1;
	$: yourName = you?.name || 'You';
	$: theirName = them?.name || 'Waiting...';
	$: yourSeed = you?.address || you?.id || 'you';
	$: theirSeed = them?.address || them?.id || '';
	$: totalPot = game.yourPotCoins + game.theirPotCoins;
</script>

<div class="players-bar">
	<div class="player-card player-card--you">
		<div class="player-identity">
			<PlayerSigil seed={yourSeed} size={64} label="Your sigil" />
			<div class="player-text">
				<div class="player-name">
					{yourName}
					<span class="player-tag">You</span>
				</div>
				<div class="player-coins">
					<CoinStack count={game.yourCoins} label="coins" dense />
				</div>
			</div>
		</div>
	</div>

	<div class="pot-display">
		<div class="pot-label">Pot</div>
		{#key totalPot}
			<div class="pot-value" in:popIn>
				<CoinStack count={totalPot} label="coins in the pot" dense />
			</div>
		{/key}
		{#if game.yourPotCoins !== game.theirPotCoins}
			<div class="pot-split">
				<span class="pot-split--you">{game.yourPotCoins}</span>
				<span class="pot-split-sep">·</span>
				<span class="pot-split--them">{game.theirPotCoins}</span>
			</div>
		{/if}
	</div>

	<div class="player-card player-card--opponent">
		<div class="player-identity player-identity--reverse">
			{#if them}
				<PlayerSigil seed={theirSeed} size={64} label="Opponent's sigil" />
			{:else}
				<span class="sigil-empty" aria-hidden="true"></span>
			{/if}
			<div class="player-text">
				<div class="player-name">{theirName}</div>
				<div class="player-coins">
					<CoinStack count={game.theirCoins} label="coins" dense />
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.player-identity {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		min-width: 0;
	}

	.player-identity--reverse {
		flex-direction: row-reverse;
		text-align: right;
	}

	.player-identity--reverse .player-text {
		align-items: flex-end;
	}

	.player-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}

	.player-coins {
		line-height: 0;
	}

	.sigil-empty {
		width: 64px;
		height: 64px;
		flex-shrink: 0;
		border: 2px dashed #4a3f52;
		box-sizing: border-box;
	}

	.pot-value {
		display: flex;
		justify-content: center;
	}

	.pot-split {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-text-dim);
		margin-top: var(--space-xs);
	}

	.pot-split--you {
		color: var(--color-primary-light);
	}

	.pot-split--them {
		color: var(--color-gold);
	}

	.pot-split-sep {
		margin: 0 4px;
	}

	@media (max-width: 768px) {
		.player-identity {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-xs);
		}

		.player-identity--reverse {
			align-items: flex-end;
		}

		.player-text {
			width: 100%;
		}

		.player-identity--reverse .player-text {
			align-items: flex-end;
		}

		.sigil-empty,
		.player-identity :global(.player-sigil) {
			width: 32px !important;
			height: 32px !important;
		}

		.player-identity :global(.player-sigil svg) {
			width: 32px;
			height: 32px;
		}
	}
</style>
