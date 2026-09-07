/**
 * Player sigils: a 32 × 32 symmetric emblem generated deterministically from a
 * string (player id or wallet address).
 *
 * Rules:
 *   - The seed is hashed with FNV-1a (32-bit). Every decision below is drawn
 *     from a mulberry32 stream seeded by that hash, so equal seeds give equal
 *     sigils on every device.
 *   - The hash picks two distinct palette families: a ground (field) and a
 *     figure, from burgundy, gold, parchment and verdant.
 *   - A 16 × 32 left half is generated and mirrored to the right, so every
 *     sigil is bilaterally symmetric like a heraldic device.
 *   - The field is banded by distance from the centre (diamond, square or
 *     round, per the hash); the figure is a cellular-automaton blob mask
 *     in the figure family's tones, with the outermost ring of the figure
 *     drawn in Ink 2 so it reads as an outlined emblem.
 *   - A 1px Ink 1 border always frames the canvas.
 *
 * Bitmaps use the SPRITE_PALETTE characters from $lib/design/specimens.
 */

export const SIGIL_SIZE = 32;

export function fnv1a(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Palette families as SPRITE_PALETTE characters, dark → light. */
export const SIGIL_FAMILIES = {
	burgundy: ['b', 'B', 'r', 'R'],
	gold: ['g', 'G', 'y', 'Y'],
	parchment: ['q', 'p', 'P', 'P'],
	verdant: ['k', 'V', 'V', 'P']
} as const;

export type SigilFamily = keyof typeof SIGIL_FAMILIES;
const FAMILY_NAMES = Object.keys(SIGIL_FAMILIES) as SigilFamily[];

export interface SigilSpec {
	hash: number;
	ground: SigilFamily;
	figure: SigilFamily;
	shape: 'diamond' | 'square' | 'round';
}

export function sigilSpec(seed: string): SigilSpec {
	const hash = fnv1a(seed);
	const ground = FAMILY_NAMES[hash & 3];
	const figure = FAMILY_NAMES[((hash & 3) + 1 + ((hash >>> 2) % 3)) % 4];
	const shape = (['diamond', 'square', 'round'] as const)[(hash >>> 4) % 3];
	return { hash, ground, figure, shape };
}

const cache = new Map<string, string[]>();

export function sigilBitmap(seed: string): string[] {
	const hit = cache.get(seed);
	if (hit) return hit;

	const spec = sigilSpec(seed);
	const rng = mulberry32(spec.hash);
	const groundTones = SIGIL_FAMILIES[spec.ground];
	const figureTones = SIGIL_FAMILIES[spec.figure];

	const HALF = SIGIL_SIZE / 2; // 16 columns, mirrored
	const cx = HALF - 0.5; // 15.5, the seam
	const cy = SIGIL_SIZE / 2 - 0.5;

	const dist = (x: number, y: number) => {
		const dx = Math.abs(x - cx);
		const dy = Math.abs(y - cy);
		if (spec.shape === 'diamond') return dx + dy;
		if (spec.shape === 'square') return Math.max(dx, dy);
		return Math.sqrt(dx * dx + dy * dy);
	};

	// Field: two or three concentric bands of the ground family
	const bandWidth = 4 + Math.floor(rng() * 4); // 4–7
	const bandOffset = Math.floor(rng() * bandWidth);
	const bandTones = [groundTones[0], groundTones[1], groundTones[0], groundTones[2]];

	// Figure: a random bit grid smoothed by cellular automaton into blobs,
	// biased toward the centre so the emblem clusters.
	let mask: boolean[][] = Array.from({ length: SIGIL_SIZE }, (_, y) =>
		Array.from({ length: HALF }, (_, x) => {
			const d = dist(x, y);
			const bias = d < 6 ? 0.62 : d < 11 ? 0.5 : 0.36;
			return rng() < bias;
		})
	);
	const passes = 2;
	for (let p = 0; p < passes; p++) {
		const next = mask.map((row) => row.slice());
		for (let y = 0; y < SIGIL_SIZE; y++) {
			for (let x = 0; x < HALF; x++) {
				let n = 0;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (!dx && !dy) continue;
						const yy = y + dy;
						let xx = x + dx;
						if (xx >= HALF) xx = 2 * HALF - 1 - xx; // across the seam
						if (yy < 0 || yy >= SIGIL_SIZE || xx < 0) continue;
						if (mask[yy][xx]) n++;
					}
				}
				next[y][x] = n >= 5 ? true : n <= 3 ? false : mask[y][x];
			}
		}
		mask = next;
	}
	// Clear the figure from the outer margin so the emblem floats in the field
	for (let y = 0; y < SIGIL_SIZE; y++) {
		for (let x = 0; x < HALF; x++) {
			if (dist(x, y) > 12.5) mask[y][x] = false;
		}
	}

	const inMask = (x: number, y: number) => {
		if (y < 0 || y >= SIGIL_SIZE) return false;
		if (x >= HALF) x = 2 * HALF - 1 - x;
		if (x < 0) return false;
		return mask[y][x];
	};

	const half: string[][] = [];
	for (let y = 0; y < SIGIL_SIZE; y++) {
		const row: string[] = [];
		for (let x = 0; x < HALF; x++) {
			if (y === 0 || y === SIGIL_SIZE - 1 || x === 0) {
				row.push('#');
				continue;
			}
			const d = dist(x, y);
			if (inMask(x, y)) {
				const edge =
					!inMask(x - 1, y) || !inMask(x + 1, y) || !inMask(x, y - 1) || !inMask(x, y + 1);
				if (edge) {
					row.push('k');
				} else {
					// light toward the top-left, like a lit relief
					const lit = !inMask(x - 1, y - 1) || !inMask(x, y - 2);
					row.push(lit ? figureTones[3] : d < 5 ? figureTones[2] : figureTones[1]);
				}
			} else {
				const band = Math.floor((d + bandOffset) / bandWidth) % bandTones.length;
				row.push(bandTones[band]);
			}
		}
		half.push(row);
	}

	// Inner hairline inside the border in Ink 2 for depth
	for (let y = 1; y < SIGIL_SIZE - 1; y++) half[y][1] = y === 1 || y === SIGIL_SIZE - 2 ? 'k' : half[y][1];
	for (let x = 1; x < HALF; x++) {
		half[1][x] = 'k';
		half[SIGIL_SIZE - 2][x] = 'k';
	}
	for (let y = 1; y < SIGIL_SIZE - 1; y++) half[y][1] = 'k';

	const bitmap = half.map((row) => row.join('') + row.slice().reverse().join(''));
	cache.set(seed, bitmap);
	return bitmap;
}
