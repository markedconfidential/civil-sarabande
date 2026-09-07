<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { GameStateView } from '@civil-sarabande/shared';
	import { calculateScores } from '$lib/game/selectors';
	import { panelIn, popIn } from '$lib/motion';
	import { play } from '$lib/audio';
	import DamageNumber from '$lib/components/art/DamageNumber.svelte';
	import ResultCrest from '$lib/components/art/ResultCrest.svelte';

	export let game: GameStateView;
	export let canEndRound = false;
	export let canStartNextRound = false;
	export let loading = false;

	const dispatch = createEventDispatcher<{ endRound: void; nextRound: void }>();

	type Outcome = 'you' | 'them' | 'tie';

	// game.roundResult is the source of truth at round end. Fall back to the
	// client-side tally only when it has not arrived; their score may still be
	// hidden then, in which case the panel shows a placeholder and no verdict.
	$: isPlayer1 = game.yourRole === 'player1';
	$: result = game.roundResult;
	$: fallback = calculateScores(game);
	$: yourScore = result ? (isPlayer1 ? result.player1Score : result.player2Score) : fallback.yourScore;
	$: theirScore = result ? (isPlayer1 ? result.player2Score : result.player1Score) : fallback.theirScore;
	$: outcome = ((): Outcome => {
		if (result) {
			if (result.winner === 'tie') return 'tie';
			return (result.winner === 'player1') === isPlayer1 ? 'you' : 'them';
		}
		if (theirScore === null) return 'tie';
		if (yourScore > theirScore) return 'you';
		if (theirScore > yourScore) return 'them';
		return 'tie';
	})();
	$: potWon = result?.potWon ?? 0;
	$: byFold = result?.byFold ?? false;
	$: roundNumber = result?.roundNumber ?? game.roundNumber;

	onMount(() => {
		if (outcome === 'you') play('win');
		else if (outcome === 'them') play('lose');
	});
</script>

<h2>Round Complete</h2>

<div class="round-result">
	<div class="final-scores">
		<div class="final-score" in:popIn={{ delay: 100 }}>
			<span class="final-score-label">Your Score</span>
			<span class="final-score-value final-score-value--you">{yourScore}</span>
			<span class="final-score-float"><DamageNumber value={yourScore} tone="you" signed={false} delay={150} /></span>
		</div>
		<div class="final-score" in:popIn={{ delay: 250 }}>
			<span class="final-score-label">Their Score</span>
			<span class="final-score-value final-score-value--them">{theirScore ?? '?'}</span>
			{#if theirScore !== null}
				<span class="final-score-float"><DamageNumber value={theirScore} tone="them" signed={false} delay={350} /></span>
			{/if}
		</div>
	</div>

	<div class="winner-announcement">
		<ResultCrest {roundNumber} {outcome} {potWon} {byFold} delay={500} />
	</div>
</div>

<div class="action-buttons" in:panelIn={{ delay: 800 }}>
	{#if canEndRound}
		<button
			type="button"
			class="btn-primary btn-lg"
			on:click={() => {
				play('commit');
				dispatch('endRound');
			}}
			disabled={loading}
		>
			Confirm Round End
		</button>
	{:else if canStartNextRound}
		<button
			type="button"
			class="btn-gold btn-lg"
			on:click={() => {
				play('commit');
				dispatch('nextRound');
			}}
			disabled={loading}
		>
			Start Next Round
		</button>
	{:else}
		<p class="waiting-text">Waiting for opponent to confirm...</p>
	{/if}
</div>

<style>
	.round-result {
		text-align: center;
		margin-bottom: var(--space-xl);
	}

	.final-scores {
		display: flex;
		justify-content: center;
		gap: var(--space-2xl);
		margin-bottom: var(--space-lg);
	}

	.final-score {
		position: relative;
		text-align: center;
	}

	.final-score-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-dim);
		margin-bottom: var(--space-xs);
	}

	.final-score-value {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 700;
		line-height: 1;
	}

	.final-score-value--you {
		color: var(--color-primary);
	}

	.final-score-value--them {
		color: var(--color-gold-dim);
	}

	.final-score-float {
		position: absolute;
		left: 50%;
		top: 100%;
		transform: translateX(-50%);
		line-height: 0;
	}

	.winner-announcement {
		margin-top: var(--space-xl);
		display: flex;
		justify-content: center;
	}

	.waiting-text {
		color: var(--color-text-dim);
		font-style: italic;
	}
</style>
