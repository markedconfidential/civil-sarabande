<script lang="ts">
	import type { GameStateView } from '@civil-sarabande/shared';
	import { popIn, quickFade } from '$lib/motion';

	export let game: GameStateView;

	$: isPlayer1 = game.yourRole === 'player1';
	$: yourName = (isPlayer1 ? game.player1.name : game.player2?.name) || 'You';
	$: theirName = (isPlayer1 ? game.player2?.name : game.player1.name) || 'Waiting...';
	$: totalPot = game.yourPotCoins + game.theirPotCoins;
</script>

<div class="players-bar">
	<div class="player-card player-card--you">
		<div class="player-name">
			{yourName}
			<span class="player-tag">You</span>
		</div>
		{#key game.yourCoins}
			<div class="player-coins" in:quickFade>{game.yourCoins} coins</div>
		{/key}
	</div>

	<div class="pot-display">
		<div class="pot-label">Total Pot</div>
		{#key totalPot}
			<div class="pot-value" in:popIn>{totalPot}</div>
		{/key}
	</div>

	<div class="player-card player-card--opponent">
		<div class="player-name">{theirName}</div>
		{#key game.theirCoins}
			<div class="player-coins" in:quickFade>{game.theirCoins} coins</div>
		{/key}
	</div>
</div>
