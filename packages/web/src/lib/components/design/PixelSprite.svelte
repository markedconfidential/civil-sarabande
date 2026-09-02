<script lang="ts">
	/**
	 * Renders a text bitmap as a crisp pixel sprite at an integer scale.
	 *
	 * Bitmaps are arrays of equal-length strings; each character maps to a
	 * palette color via `palette`, and '.' is transparent. Used for the
	 * procedural specimens on the art bible page.
	 */
	import { SPRITE_PALETTE } from '$lib/design/specimens';

	export let bitmap: string[];
	export let scale = 2;
	export let label = 'Pixel sprite';
	export let palette: Record<string, string> = SPRITE_PALETTE;

	$: height = bitmap.length;
	$: width = bitmap[0]?.length ?? 0;
	$: pixels = bitmap.flatMap((row, y) =>
		[...row].flatMap((ch, x) => (ch === '.' || !palette[ch] ? [] : [{ x, y, fill: palette[ch] }]))
	);
</script>

<svg
	viewBox="0 0 {width} {height}"
	width={width * scale}
	height={height * scale}
	role="img"
	aria-label={label}
	class="pixel-sprite"
>
	{#each pixels as p}
		<rect x={p.x} y={p.y} width="1" height="1" fill={p.fill} />
	{/each}
</svg>

<style>
	.pixel-sprite {
		display: block;
		shape-rendering: crispEdges;
		image-rendering: pixelated;
	}
</style>
