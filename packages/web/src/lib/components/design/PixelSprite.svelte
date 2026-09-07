<script lang="ts">
	/**
	 * Renders a text bitmap as a crisp pixel sprite at an integer scale.
	 *
	 * Bitmaps are arrays of equal-length strings; each character maps to a
	 * palette color via `palette`, and '.' (or any unmapped character) is
	 * transparent. Horizontal runs of one color collapse into a single rect so
	 * a board of 36 numerals stays light in the DOM.
	 */
	import { SPRITE_PALETTE } from '$lib/design/specimens';

	export let bitmap: string[];
	export let scale = 2;
	export let label = 'Pixel sprite';
	export let palette: Record<string, string> = SPRITE_PALETTE;
	/** Set when the sprite is purely decorative next to visible text */
	export let decorative = false;

	$: height = bitmap.length;
	$: width = bitmap[0]?.length ?? 0;
	$: runs = bitmap.flatMap((row, y) => {
		const out: { x: number; y: number; w: number; fill: string }[] = [];
		let x = 0;
		while (x < row.length) {
			const ch = row[x];
			const fill = palette[ch];
			if (ch === '.' || !fill) {
				x++;
				continue;
			}
			let w = 1;
			while (x + w < row.length && row[x + w] === ch) w++;
			out.push({ x, y, w, fill });
			x += w;
		}
		return out;
	});
</script>

<svg
	viewBox="0 0 {width} {height}"
	width={width * scale}
	height={height * scale}
	role={decorative ? 'presentation' : 'img'}
	aria-label={decorative ? undefined : label}
	aria-hidden={decorative ? 'true' : undefined}
	class="pixel-sprite"
>
	{#each runs as r}
		<rect x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />
	{/each}
</svg>

<style>
	.pixel-sprite {
		display: block;
		shape-rendering: crispEdges;
		image-rendering: pixelated;
	}
</style>
