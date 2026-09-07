/**
 * Painted surfaces for the board: the parchment cell texture and the
 * hand-drawn ink grid. Both are generated SVG so they ship with no files and
 * stay deterministic.
 */

/** Encode an SVG string as a CSS `url()` data URI. */
export function svgDataUri(svg: string): string {
	const encoded = svg
		.replace(/\s+/g, ' ')
		.replace(/"/g, "'")
		.replace(/%/g, '%25')
		.replace(/#/g, '%23')
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E');
	return `url("data:image/svg+xml,${encoded}")`;
}

/**
 * Parchment tile: warm gradient plus turbulence grain. Tiles seamlessly via
 * stitchTiles. 96 × 96 so the grain is finer than a cell.
 */
export const PARCHMENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<defs>
<filter id="g" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11" stitchTiles="stitch"/>
<feColorMatrix type="saturate" values="0"/>
<feComponentTransfer><feFuncA type="linear" slope="0.22" intercept="-0.02"/></feComponentTransfer>
</filter>
<filter id="b" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" stitchTiles="stitch"/>
<feColorMatrix type="matrix" values="0 0 0 0 0.72 0 0 0 0 0.62 0 0 0 0 0.45 0 0 0 0.35 0"/>
</filter>
<linearGradient id="w" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f1e6cf"/><stop offset="1" stop-color="#d9c8a5"/>
</linearGradient>
</defs>
<rect width="96" height="96" fill="url(#w)"/>
<rect width="96" height="96" filter="url(#b)"/>
<rect width="96" height="96" filter="url(#g)"/>
</svg>`;

export const PARCHMENT_URL = svgDataUri(PARCHMENT_SVG);

/** Aged-edge vignette laid over the whole board, inside the frame. */
export const BOARD_VIGNETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" preserveAspectRatio="none">
<defs><radialGradient id="v" cx="0.5" cy="0.5" r="0.72"><stop offset="0.55" stop-color="#b8a27c" stop-opacity="0"/><stop offset="1" stop-color="#7a6444" stop-opacity="0.45"/></radialGradient></defs>
<rect width="200" height="200" fill="url(#v)"/>
</svg>`;
export const BOARD_VIGNETTE_URL = svgDataUri(BOARD_VIGNETTE_SVG);

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Hand-drawn grid lines for an N × N board, in a 0..N unit viewBox. Each line
 * is a slightly wandering cubic path so the grid reads as inked rather than
 * ruled. Rendered with vector-effect: non-scaling-stroke so the tremor is a
 * fraction of a cell whatever the cell size.
 */
export function gridInkPaths(size = 6, seed = 7): string[] {
	const rng = seeded(seed);
	const wob = () => (rng() - 0.5) * 0.06;
	const paths: string[] = [];
	for (let i = 0; i <= size; i++) {
		// vertical
		paths.push(
			`M${i + wob()} ${0} C ${i + wob()} ${size * 0.3}, ${i + wob()} ${size * 0.7}, ${i + wob()} ${size}`
		);
		// horizontal
		paths.push(
			`M0 ${i + wob()} C ${size * 0.3} ${i + wob()}, ${size * 0.7} ${i + wob()}, ${size} ${i + wob()}`
		);
	}
	return paths;
}

/** A second, fainter pass drawn with a different seed for the double-stroke look. */
export function gridInkPathsGhost(size = 6): string[] {
	return gridInkPaths(size, 23);
}
