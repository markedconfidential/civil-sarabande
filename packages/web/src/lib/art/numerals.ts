/**
 * Suited numeral glyphs 1–36.
 *
 * Every board value is a unique 24 × 24 sprite generated deterministically from
 * three parts, so the set is consistent and every glyph is readable:
 *
 *   1. The decimal digits, drawn from a 5 × 7 pixel font and doubled to 10 × 14
 *      so each font pixel is 4 CSS px at the canonical 2× display scale.
 *      One digit is centred; two digits sit side by side with a 2px gutter.
 *      Digits occupy rows 1–14.
 *   2. A suit motif for the value band (six bands of six): Moon 1–6,
 *      Star 7–12, Chalice 13–18, Blade 19–24, Wand 25–30, Crown 31–36.
 *      The motif is 7 × 7 and sits bottom-left (rows 16–22, cols 1–7).
 *   3. A rank marker: 1–6 pips (2 × 2) laid out three per row, bottom-right,
 *      giving the value's position within its band.
 *
 * Bitmaps use two characters: '#' is the primary ink and 'K' the secondary
 * shade. `Numeral.svelte` maps those to real colors per tone (ink on
 * parchment, parchment on ink, or muted), so the same bitmap serves every
 * surface. '.' is transparent.
 */

export const NUMERAL_SIZE = 24;

export const SUITS = ['Moon', 'Star', 'Chalice', 'Blade', 'Wand', 'Crown'] as const;
export type Suit = (typeof SUITS)[number];

/** 5 × 7 pixel digit font. '#' ink, '.' transparent. */
export const DIGIT_FONT: Record<string, string[]> = {
	'0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
	'1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
	'2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
	'3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
	'4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
	'5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
	'6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
	'7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
	'8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
	'9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.']
};

/** 7 × 7 suit motifs, one per value band. */
export const SUIT_MOTIFS: Record<Suit, string[]> = {
	Moon: ['..###..', '.##K...', '##K....', '##.....', '##K....', '.##K...', '..###..'],
	Star: ['...#...', '.#.#.#.', '..#K#..', '###K###', '..#K#..', '.#.#.#.', '...#...'],
	Chalice: ['#######', '.#KKK#.', '.#KKK#.', '..###..', '...#...', '...#...', '.#####.'],
	Blade: ['...#...', '..#K#..', '..#K#..', '..#K#..', '#######', '...#...', '..###..'],
	Wand: ['....#.#', '.....#.', '....#.#', '...#...', '..#K...', '.#K....', '#K.....'],
	Crown: ['#..#..#', '##.#.##', '#######', '#KKKKK#', '#######', '.#####.', '.......']
};

export function suitOf(value: number): Suit {
	return SUITS[Math.min(5, Math.max(0, Math.floor((value - 1) / 6)))];
}

/** 1–6: the value's position within its suit band. */
export function rankOf(value: number): number {
	return ((value - 1) % 6) + 1;
}

function blank(): string[][] {
	return Array.from({ length: NUMERAL_SIZE }, () => Array(NUMERAL_SIZE).fill('.'));
}

function stamp(grid: string[][], rows: string[], x0: number, y0: number, scale = 1) {
	rows.forEach((row, ry) => {
		[...row].forEach((ch, rx) => {
			if (ch === '.') return;
			for (let dy = 0; dy < scale; dy++) {
				for (let dx = 0; dx < scale; dx++) {
					const x = x0 + rx * scale + dx;
					const y = y0 + ry * scale + dy;
					if (y >= 0 && y < NUMERAL_SIZE && x >= 0 && x < NUMERAL_SIZE) grid[y][x] = ch;
				}
			}
		});
	});
}

const cache = new Map<number, string[]>();

/** The 24 × 24 bitmap for a board value (1–36). Values outside are clamped. */
export function numeralBitmap(value: number): string[] {
	const v = Math.min(36, Math.max(1, Math.round(value)));
	const hit = cache.get(v);
	if (hit) return hit;

	const grid = blank();
	const digits = String(v);

	// Digits, doubled, rows 1–14
	if (digits.length === 1) {
		stamp(grid, DIGIT_FONT[digits], 7, 1, 2);
	} else {
		stamp(grid, DIGIT_FONT[digits[0]], 1, 1, 2);
		stamp(grid, DIGIT_FONT[digits[1]], 13, 1, 2);
	}

	// Suit motif, bottom-left
	stamp(grid, SUIT_MOTIFS[suitOf(v)], 1, 16, 1);

	// Rank pips, bottom-right: three per row, 2 × 2 with a 1px gutter
	const rank = rankOf(v);
	for (let i = 0; i < rank; i++) {
		const col = 12 + (i % 3) * 3;
		const row = 17 + Math.floor(i / 3) * 3;
		stamp(grid, ['KK', 'KK'], col, row, 1);
	}

	const bitmap = grid.map((r) => r.join(''));
	cache.set(v, bitmap);
	return bitmap;
}

/** All 36 glyphs, in value order, for the specimen sheet. */
export function numeralSheet(): { value: number; bitmap: string[] }[] {
	return Array.from({ length: 36 }, (_, i) => ({ value: i + 1, bitmap: numeralBitmap(i + 1) }));
}

// ---------------------------------------------------------------------------
// Damage-number digits: the same 5 × 7 font with a 1px outline, composed into
// one strip per number so it can float as a single sprite.
// ---------------------------------------------------------------------------

const SIGN_GLYPHS: Record<string, string[]> = {
	'+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
	'-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....']
};

/**
 * Bitmap for a floating number such as "+17" or "-4". Digits are the 5 × 7
 * font doubled to 10 × 14 (so a digit is 24 × 32 at the 2× display scale,
 * matching the art bible's damage-digit size), separated by a 2px gutter and
 * wrapped in a 1px outline. Fill pixels are 'F', outline pixels '#'.
 */
export function damageBitmap(text: string): string[] {
	const glyphs = [...text].map((ch) => DIGIT_FONT[ch] ?? SIGN_GLYPHS[ch] ?? SIGN_GLYPHS['-']);
	const cell = 12; // 10px glyph + 2px gutter
	const width = glyphs.length * cell + 2;
	const height = 16; // 14px glyph + 1px outline each side
	const grid: string[][] = Array.from({ length: height }, () => Array(width).fill('.'));
	glyphs.forEach((g, i) => {
		g.forEach((row, y) => {
			[...row].forEach((ch, x) => {
				if (ch === '.') return;
				for (let dy = 0; dy < 2; dy++) {
					for (let dx = 0; dx < 2; dx++) {
						grid[y * 2 + 1 + dy][i * cell + 1 + x * 2 + dx] = 'F';
					}
				}
			});
		});
	});
	// outline: any transparent pixel touching a fill (8-neighbourhood)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (grid[y][x] !== '.') continue;
			let touch = false;
			for (let dy = -1; dy <= 1 && !touch; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const yy = y + dy;
					const xx = x + dx;
					if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
					if (grid[yy][xx] === 'F') {
						touch = true;
						break;
					}
				}
			}
			if (touch) grid[y][x] = '#';
		}
	}
	return grid.map((r) => r.join(''));
}
