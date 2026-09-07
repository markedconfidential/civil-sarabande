<script lang="ts">
	/**
	 * A suited board numeral (1–36) as a 24 × 24 pixel sprite at 2×.
	 * Carries an aria-label with the numeric value.
	 */
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { numeralBitmap, rankOf, suitOf } from '$lib/art/numerals';

	export let value: number;
	export let scale = 2;
	/** ink: dark glyph for parchment; paper: light glyph for ink surfaces */
	export let tone: 'ink' | 'paper' = 'ink';
	export let muted = false;

	const PALETTES: Record<string, Record<string, string>> = {
		ink: { '#': '#0d0a0e', K: '#4a3f52' },
		paper: { '#': '#f1e6cf', K: '#b8a27c' },
		'ink-muted': { '#': '#6b5f70', K: '#b8a27c' },
		'paper-muted': { '#': '#b8a27c', K: '#4a3f52' }
	};

	$: palette = PALETTES[muted ? `${tone}-muted` : tone];
	$: bitmap = numeralBitmap(value);
	$: label = `${value} (${suitOf(value)} ${rankOf(value)})`;
</script>

<span class="numeral" class:numeral--muted={muted} title={label}>
	<PixelSprite {bitmap} {scale} label={String(value)} {palette} />
</span>

<style>
	.numeral {
		display: inline-block;
		line-height: 0;
	}
</style>
