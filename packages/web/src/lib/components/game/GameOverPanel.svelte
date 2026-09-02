<script lang="ts">
	export let yourCoins: number;
	export let theirCoins: number;
</script>

<h2>Game Over</h2>

<div class="game-over-result">
	{#if yourCoins > theirCoins}
		<p class="winner-text winner-text--you">You Won the Game!</p>
	{:else if theirCoins > yourCoins}
		<p class="winner-text winner-text--them">Opponent Won</p>
	{:else}
		<p class="winner-text">The game ended in a tie!</p>
	{/if}

	<div class="final-coins">
		<p>Your final coins: <strong>{yourCoins}</strong></p>
		<p>Their final coins: <strong>{theirCoins}</strong></p>
	</div>
</div>

<a href="/" class="btn-gold btn-lg">Play Again</a>

<style>
	.game-over-result {
		text-align: center;
		margin-bottom: var(--space-xl);
	}

	.final-coins {
		margin-top: var(--space-lg);
		color: var(--color-text-dim);
	}

	.final-coins strong {
		color: var(--color-gold);
	}
</style>
