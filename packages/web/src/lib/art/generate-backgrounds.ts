/**
 * Generates the three watercolor page backgrounds as SVG files.
 *
 *   bun run src/lib/art/generate-backgrounds.ts
 *
 * Output: static/art/backgrounds/{lobby,duel,settlement}.svg. Deterministic:
 * every blot position comes from a seeded generator, so re-running produces
 * identical files. The washes are full-bleed (2048 × 1536 viewBox, slice
 * fit), dark at the edges (Ink 1 → Ink 2 → Burgundy 1) and warm at the centre
 * so pixel sprites read on top. Blots are turbulence-displaced ellipses in the
 * sprite palette at 20–40 percent, which gives the wet edge.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 2048;
const H = 1536;

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

interface Scene {
	name: string;
	seed: number;
	centre: string; // warm centre color
	centreOpacity: number;
	blots: { color: string; count: number; min: number; max: number; opacity: [number, number] }[];
	strokes: number;
}

const SCENES: Scene[] = [
	{
		name: 'lobby',
		seed: 101,
		centre: '#d9c8a5',
		centreOpacity: 0.16,
		blots: [
			{ color: '#8b4049', count: 5, min: 220, max: 420, opacity: [0.18, 0.3] },
			{ color: '#c9a227', count: 4, min: 180, max: 360, opacity: [0.16, 0.28] },
			{ color: '#2a2230', count: 3, min: 260, max: 480, opacity: [0.25, 0.4] }
		],
		strokes: 4
	},
	{
		name: 'duel',
		seed: 202,
		centre: '#d9c8a5',
		centreOpacity: 0.12,
		blots: [
			{ color: '#6d2f38', count: 6, min: 240, max: 520, opacity: [0.22, 0.38] },
			{ color: '#9a7d1c', count: 3, min: 160, max: 300, opacity: [0.16, 0.26] },
			{ color: '#0d0a0e', count: 4, min: 300, max: 560, opacity: [0.3, 0.45] }
		],
		strokes: 6
	},
	{
		name: 'settlement',
		seed: 303,
		centre: '#f1e6cf',
		centreOpacity: 0.14,
		blots: [
			{ color: '#c9a227', count: 6, min: 220, max: 460, opacity: [0.2, 0.34] },
			{ color: '#4a8b5c', count: 3, min: 160, max: 320, opacity: [0.14, 0.24] },
			{ color: '#2a2230', count: 3, min: 260, max: 500, opacity: [0.22, 0.36] }
		],
		strokes: 3
	}
];

function fmt(n: number): string {
	return n.toFixed(1);
}

function scene(s: Scene): string {
	const rng = seeded(s.seed);
	const parts: string[] = [];

	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`);
	parts.push(`<defs>
<filter id="bleed" x="-30%" y="-30%" width="160%" height="160%">
<feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="${s.seed}" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="180" xChannelSelector="R" yChannelSelector="G"/>
<feGaussianBlur stdDeviation="6"/>
</filter>
<filter id="edge" x="-30%" y="-30%" width="160%" height="160%">
<feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="${s.seed + 1}" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="90" xChannelSelector="R" yChannelSelector="G"/>
<feGaussianBlur stdDeviation="2"/>
</filter>
<filter id="grain" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${s.seed + 2}"/>
<feColorMatrix type="saturate" values="0"/>
<feComponentTransfer><feFuncA type="linear" slope="0.07"/></feComponentTransfer>
</filter>
<radialGradient id="ground" cx="0.5" cy="0.45" r="0.75">
<stop offset="0" stop-color="#2a2230"/>
<stop offset="0.55" stop-color="#1a1520"/>
<stop offset="1" stop-color="#0d0a0e"/>
</radialGradient>
<radialGradient id="warm" cx="0.5" cy="0.45" r="0.5">
<stop offset="0" stop-color="${s.centre}" stop-opacity="${s.centreOpacity}"/>
<stop offset="1" stop-color="${s.centre}" stop-opacity="0"/>
</radialGradient>
</defs>`);

	parts.push(`<rect width="${W}" height="${H}" fill="url(#ground)"/>`);
	parts.push(`<rect width="${W}" height="${H}" fill="url(#warm)"/>`);

	// Cool edge wash: Burgundy 1 bleeding in from the corners
	parts.push(`<g filter="url(#bleed)">`);
	for (const [cx, cy] of [
		[0, 0],
		[W, 0],
		[0, H],
		[W, H]
	]) {
		parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${fmt(520 + rng() * 200)}" ry="${fmt(420 + rng() * 200)}" fill="#6d2f38" opacity="0.28"/>`);
	}
	parts.push(`</g>`);

	// Blots
	for (const b of s.blots) {
		for (let i = 0; i < b.count; i++) {
			const cx = W * (0.12 + rng() * 0.76);
			const cy = H * (0.12 + rng() * 0.76);
			const rx = b.min + rng() * (b.max - b.min);
			const ry = rx * (0.55 + rng() * 0.6);
			const rot = rng() * 180;
			const op = b.opacity[0] + rng() * (b.opacity[1] - b.opacity[0]);
			parts.push(`<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})" fill="${b.color}" opacity="${op.toFixed(2)}" filter="url(#bleed)"/>`);
			// wet edge: a thin darker ring of the same hue at the rim
			parts.push(`<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx * 1.02)}" ry="${fmt(ry * 1.02)}" transform="rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})" fill="none" stroke="${b.color}" stroke-width="${fmt(10 + rng() * 14)}" opacity="${(op * 0.9).toFixed(2)}" filter="url(#edge)"/>`);
		}
	}

	// Ink strokes with tremor
	for (let i = 0; i < s.strokes; i++) {
		const x0 = W * rng();
		const y0 = H * rng();
		const x1 = x0 + (rng() - 0.5) * 900;
		const y1 = y0 + (rng() - 0.5) * 500;
		const c1x = x0 + (rng() - 0.5) * 400;
		const c1y = y0 + (rng() - 0.5) * 400;
		const c2x = x1 + (rng() - 0.5) * 400;
		const c2y = y1 + (rng() - 0.5) * 400;
		parts.push(`<path d="M${fmt(x0)} ${fmt(y0)} C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(x1)} ${fmt(y1)}" fill="none" stroke="#0d0a0e" stroke-opacity="0.55" stroke-width="${fmt(2 + rng() * 3)}" stroke-linecap="round" filter="url(#edge)"/>`);
	}

	parts.push(`<rect width="${W}" height="${H}" filter="url(#grain)"/>`);
	parts.push(`</svg>`);
	return parts.join('\n');
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', '..', 'static', 'art', 'backgrounds');
mkdirSync(outDir, { recursive: true });
for (const s of SCENES) {
	const file = join(outDir, `${s.name}.svg`);
	writeFileSync(file, scene(s) + '\n');
	console.log(`wrote ${file}`);
}
