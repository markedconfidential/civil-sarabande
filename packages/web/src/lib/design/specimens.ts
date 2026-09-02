/**
 * Procedural sprite specimens for the art bible page.
 *
 * These are placeholders drawn to the sizes in docs/art-bible.md so the UI can
 * be built against correct dimensions before real art lands. Each bitmap is a
 * list of equal-length rows; '.' is transparent and other characters index
 * SPRITE_PALETTE.
 */

/** Character to color map, restricted to the 16-color sprite palette. */
export const SPRITE_PALETTE: Record<string, string> = {
	'#': '#0d0a0e', // Ink 1
	k: '#2a2230', // Ink 2
	K: '#4a3f52', // Ink 3
	P: '#f1e6cf', // Parchment 1
	p: '#d9c8a5', // Parchment 2
	q: '#b8a27c', // Parchment 3
	b: '#6d2f38', // Burgundy 1
	B: '#8b4049', // Burgundy 2
	r: '#a85560', // Burgundy 3
	R: '#d08090', // Burgundy 4
	g: '#9a7d1c', // Gold 1
	G: '#c9a227', // Gold 2
	y: '#e6bb3a', // Gold 3
	Y: '#f5dc7a' // Gold 4
};

/** Suited numeral specimen: the value 17, 24 × 24. */
export const NUMERAL_17: string[] = [
	'........................',
	'........................',
	'........................',
	'........................',
	'....###....##########...',
	'...####....#PPPPPPPP#...',
	'..##P##....#########....',
	'.#..P##...........##....',
	'....P##..........##.....',
	'....P##.........##......',
	'....P##........##.......',
	'....P##.......##........',
	'....P##......##.........',
	'....P##......##.........',
	'....P##......##.........',
	'....P##......##.........',
	'..#######....##.........',
	'..#PPPPP#....##.........',
	'..#######....##.........',
	'........................',
	'..........GG............',
	'.........GYYG...........',
	'..........GG............',
	'........................'
];

/** Coin specimen, 12 × 12. */
export const COIN: string[] = [
	'....####....',
	'..##GGGG##..',
	'.#GYYGGGGG#.',
	'.#YYGGGGGg#.',
	'#GYGGGGGGgg#',
	'#GGGG##GGgg#',
	'#GGGG##GGgg#',
	'#GGGGGGGggg#',
	'.#GGGGGgggg#',
	'.#gGGGggggg#',
	'..##gggg##..',
	'....####....'
];

/** Cursor specimen, 12 × 12, hot-spot at top-left. */
export const CURSOR: string[] = [
	'#...........',
	'##..........',
	'#Y#.........',
	'#YY#........',
	'#YYY#.......',
	'#YYYY#......',
	'#YYYYY#.....',
	'#YYYYYY#....',
	'#YYY####....',
	'#Y#YY#......',
	'##.#YY#.....',
	'#...##......'
];
