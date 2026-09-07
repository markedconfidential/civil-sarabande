<script lang="ts">
	/**
	 * A coin count as sprite stacks plus the number.
	 *
	 * One sprite per ten coins, stacked in columns of up to five, then the
	 * loose coins (count mod 10) as a smaller pile. At most twelve sprites are
	 * drawn: tens are shown first, loose coins fill what is left.
	 */
	import Coin from './Coin.svelte';
	import { quickFade } from '$lib/motion';

	export let count: number;
	export let label = 'coins';
	/** Hide the numeric count (when the surrounding text already states it) */
	export let hideNumber = false;
	export let size: 'sm' | 'md' = 'md';
	/** Dense: columns of ten at a 3px step, for the players bar */
	export let dense = false;

	const MAX_SPRITES = 12;
	$: PER_COLUMN = dense ? 10 : 5;

	$: safe = Math.max(0, Math.floor(count));
	$: tens = Math.min(Math.floor(safe / 10), MAX_SPRITES);
	$: loose = Math.min(safe % 10, MAX_SPRITES - tens);
	$: tenColumns = Array.from({ length: Math.ceil(tens / PER_COLUMN) }, (_, i) =>
		Math.min(PER_COLUMN, tens - i * PER_COLUMN)
	);
	$: looseColumns = Array.from({ length: Math.ceil(loose / PER_COLUMN) }, (_, i) =>
		Math.min(PER_COLUMN, loose - i * PER_COLUMN)
	);
</script>

<span class="coin-stack coin-stack--{size}" class:coin-stack--dense={dense} role="img" aria-label="{safe} {label}">
	<span class="piles" aria-hidden="true">
		{#if safe === 0}
			<span class="pile pile--empty"><Coin decorative /></span>
		{/if}
		{#each tenColumns as n}
			<span class="pile pile--tens" style="--n:{n}">
				{#each Array(n) as _, i}
					<span class="pile-coin" style="--i:{i}"><Coin decorative /></span>
				{/each}
			</span>
		{/each}
		{#each looseColumns as n}
			<span class="pile pile--loose" style="--n:{n}">
				{#each Array(n) as _, i}
					<span class="pile-coin" style="--i:{i}"><Coin decorative /></span>
				{/each}
			</span>
		{/each}
	</span>
	{#if !hideNumber}
		{#key safe}
			<span class="count" in:quickFade>{safe}</span>
		{/key}
	{/if}
</span>

<style>
	.coin-stack {
		display: inline-flex;
		align-items: flex-end;
		gap: var(--space-sm);
		line-height: 0;
	}

	.piles {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
	}

	.pile {
		position: relative;
		display: inline-block;
		width: 24px;
		/* 24px coin plus 4px per extra coin in the stack */
		height: calc(24px + (var(--n) - 1) * 4px);
	}

	.pile--empty {
		opacity: 0.35;
		filter: grayscale(1);
	}

	.pile--loose {
		margin-left: 4px;
	}

	.pile-coin {
		position: absolute;
		left: 0;
		bottom: calc(var(--i) * 4px);
	}

	/* Loose coins are dimmer so tens read as the heavy stacks */
	.pile--loose .pile-coin {
		filter: brightness(0.86);
	}

	.count {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 1;
		color: var(--color-gold);
		padding-bottom: 4px;
		text-shadow: 1px 1px 0 #0d0a0e;
	}

	.coin-stack--dense .pile {
		height: calc(24px + (var(--n) - 1) * 3px);
	}

	.coin-stack--dense .pile-coin {
		bottom: calc(var(--i) * 3px);
	}

	.coin-stack--dense .pile--loose {
		margin-left: 2px;
	}

	.coin-stack--sm .count {
		font-size: 0.85rem;
	}
</style>
