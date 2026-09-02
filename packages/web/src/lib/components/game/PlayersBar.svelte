<script lang="ts">
	import type { GameStateView } from '@civil-sarabande/shared';

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
		<div class="player-coins">{game.yourCoins} coins</div>
	</div>

	<div class="pot-display">
		<div class="pot-label">Total Pot</div>
		<div class="pot-value">{totalPot}</div>
	</div>

	<div class="player-card player-card--opponent">
		<div class="player-name">{theirName}</div>
		<div class="player-coins">{game.theirCoins} coins</div>
	</div>
</div>
