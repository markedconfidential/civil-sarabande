<script lang="ts">
	/**
	 * JRPG floating number: an outlined pixel-digit strip that rises and fades.
	 * `tone` picks the palette (you: burgundy, them: gold, neutral: parchment).
	 * Under reduced motion it simply appears and stays.
	 */
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { damageBitmap } from '$lib/art/numerals';

	export let value: number | string;
	export let tone: 'you' | 'them' | 'neutral' = 'you';
	/** Show a leading + for positive numbers */
	export let signed = true;
	export let delay = 0;
	export let scale = 2;

	const PALETTES = {
		you: { F: '#d08090', '#': '#0d0a0e' },
		them: { F: '#f5dc7a', '#': '#0d0a0e' },
		neutral: { F: '#f1e6cf', '#': '#0d0a0e' }
	};

	$: text =
		typeof value === 'number' ? (signed && value > 0 ? `+${value}` : String(value)) : value;
	$: bitmap = damageBitmap(text);
</script>

<span class="damage-number damage-number--{tone}" style="animation-delay:{delay}ms" aria-hidden="true">
	<PixelSprite {bitmap} {scale} palette={PALETTES[tone]} label={text} />
</span>

<style>
	.damage-number {
		display: inline-block;
		line-height: 0;
		pointer-events: none;
		opacity: 0;
		animation: damage-rise 1800ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
		filter: drop-shadow(2px 2px 0 rgba(13, 10, 14, 0.6));
	}

	@keyframes damage-rise {
		0% {
			opacity: 0;
			transform: translateY(8px) scale(0.8);
		}
		12% {
			opacity: 1;
			transform: translateY(-4px) scale(1.1);
		}
		30% {
			transform: translateY(-10px) scale(1);
		}
		75% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translateY(-40px) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.damage-number {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
