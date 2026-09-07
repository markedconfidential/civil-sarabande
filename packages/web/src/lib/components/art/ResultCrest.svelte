<script lang="ts">
	/**
	 * Round-result crest: an SVG shield stamped on at round end with the
	 * verdict text. Burgundy when you won, gold when the opponent did, ink
	 * on a tie.
	 */
	import { popIn } from '$lib/motion';

	export let roundNumber: number;
	export let outcome: 'you' | 'them' | 'tie';
	export let potWon = 0;
	export let byFold = false;
	export let delay = 0;

	$: headline =
		outcome === 'you'
			? `YOU WON${potWon > 0 ? ` +${potWon}` : ''}`
			: outcome === 'them'
				? `OPPONENT WON${potWon > 0 ? ` +${potWon}` : ''}`
				: 'TIE';
</script>

<div class="crest crest--{outcome}" in:popIn={{ delay, duration: 320 }} role="status">
	<svg viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" class="crest-svg">
		<!-- laurels -->
		<path d="M10 40 C 4 30, 6 18, 16 12" fill="none" stroke="var(--crest-leaf)" stroke-width="2" stroke-linecap="round" />
		<path d="M54 40 C 60 30, 58 18, 48 12" fill="none" stroke="var(--crest-leaf)" stroke-width="2" stroke-linecap="round" />
		{#each [0, 1, 2, 3] as i}
			<ellipse cx={9 + i * 1.5} cy={36 - i * 7} rx="3" ry="1.6" fill="var(--crest-leaf)" transform="rotate({-50 + i * 10} {9 + i * 1.5} {36 - i * 7})" />
			<ellipse cx={55 - i * 1.5} cy={36 - i * 7} rx="3" ry="1.6" fill="var(--crest-leaf)" transform="rotate({50 - i * 10} {55 - i * 1.5} {36 - i * 7})" />
		{/each}
		<!-- shield -->
		<path d="M32 6 L50 12 L50 34 C 50 48, 40 58, 32 64 C 24 58, 14 48, 14 34 L14 12 Z" fill="var(--crest-fill)" stroke="#0d0a0e" stroke-width="2" />
		<path d="M32 10 L46 15 L46 34 C 46 45, 38 53, 32 58 C 26 53, 18 45, 18 34 L18 15 Z" fill="none" stroke="var(--crest-line)" stroke-width="1.5" />
		<!-- charge: column stroke for you, row stroke for them, both crossed for tie -->
		{#if outcome === 'you'}
			<rect x="29" y="18" width="6" height="30" fill="var(--crest-charge)" />
			<rect x="26" y="18" width="12" height="3" fill="var(--crest-charge)" />
		{:else if outcome === 'them'}
			<rect x="19" y="30" width="26" height="6" fill="var(--crest-charge)" />
			<rect x="19" y="27" width="3" height="12" fill="var(--crest-charge)" />
			<rect x="42" y="27" width="3" height="12" fill="var(--crest-charge)" />
		{:else}
			<rect x="29" y="18" width="6" height="30" fill="var(--crest-charge)" />
			<rect x="19" y="30" width="26" height="6" fill="var(--crest-charge)" />
		{/if}
		<!-- ribbon -->
		<path d="M8 60 L20 56 L44 56 L56 60 L52 68 L44 64 L20 64 L12 68 Z" fill="var(--crest-ribbon)" stroke="#0d0a0e" stroke-width="1.5" />
	</svg>
	<div class="crest-text">
		<span class="crest-round">Round {roundNumber}</span>
		<span class="crest-headline">{headline}</span>
		{#if byFold}<span class="crest-note">Won by fold</span>{/if}
	</div>
</div>

<style>
	.crest {
		display: inline-flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-lg) var(--space-sm) var(--space-sm);
		--crest-fill: #2a2230;
		--crest-line: #b8a27c;
		--crest-leaf: #b8a27c;
		--crest-charge: #d9c8a5;
		--crest-ribbon: #d9c8a5;
		--crest-text: #d9c8a5;
	}

	.crest--you {
		--crest-fill: #8b4049;
		--crest-line: #d08090;
		--crest-leaf: #c9a227;
		--crest-charge: #f1e6cf;
		--crest-ribbon: #c9a227;
		--crest-text: #d08090;
	}

	.crest--them {
		--crest-fill: #c9a227;
		--crest-line: #f5dc7a;
		--crest-leaf: #9a7d1c;
		--crest-charge: #2a2230;
		--crest-ribbon: #8b4049;
		--crest-text: #e6bb3a;
	}

	.crest-svg {
		flex-shrink: 0;
		filter: drop-shadow(2px 3px 0 rgba(13, 10, 14, 0.5));
	}

	.crest-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
	}

	.crest-round {
		font-family: var(--font-display);
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--color-text-dim);
	}

	.crest-headline {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.35rem;
		letter-spacing: 0.08em;
		color: var(--crest-text);
		text-shadow: 1px 1px 0 #0d0a0e;
		line-height: 1.2;
	}

	.crest-note {
		font-size: 0.8rem;
		font-style: italic;
		color: var(--color-text-dim);
	}
</style>
