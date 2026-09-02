<script lang="ts">
	import { onMount } from 'svelte';
	import { panelIn, popIn, quickFade } from '$lib/motion';
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { COIN, CURSOR, NUMERAL_17 } from '$lib/design/specimens';

	// ------------------------------------------------------------------
	// Palette: sprite palette is fixed; UI tokens are read live from CSS
	// ------------------------------------------------------------------
	const spritePalette = [
		{ name: 'Ink 1', hex: '#0d0a0e', role: 'Outlines, board lines' },
		{ name: 'Ink 2', hex: '#2a2230', role: 'Interior shadow' },
		{ name: 'Ink 3', hex: '#4a3f52', role: 'Mid shadow, disabled' },
		{ name: 'Parchment 1', hex: '#f1e6cf', role: 'Brightest highlight' },
		{ name: 'Parchment 2', hex: '#d9c8a5', role: 'Paper mid-tone' },
		{ name: 'Parchment 3', hex: '#b8a27c', role: 'Aged edge' },
		{ name: 'Burgundy 1', hex: '#6d2f38', role: 'You, dark' },
		{ name: 'Burgundy 2', hex: '#8b4049', role: 'You, base' },
		{ name: 'Burgundy 3', hex: '#a85560', role: 'You, light' },
		{ name: 'Burgundy 4', hex: '#d08090', role: 'You, highlight' },
		{ name: 'Gold 1', hex: '#9a7d1c', role: 'Opponent, dark' },
		{ name: 'Gold 2', hex: '#c9a227', role: 'Opponent, base' },
		{ name: 'Gold 3', hex: '#e6bb3a', role: 'Opponent, light' },
		{ name: 'Gold 4', hex: '#f5dc7a', role: 'Opponent, highlight' },
		{ name: 'Verdant', hex: '#4a8b5c', role: 'Success, win' },
		{ name: 'Blood', hex: '#a84545', role: 'Danger, loss, fold' }
	];

	const tokenNames = [
		'--color-bg-dark',
		'--color-bg-surface',
		'--color-bg-elevated',
		'--color-bg-card',
		'--color-primary-dark',
		'--color-primary',
		'--color-primary-light',
		'--color-gold-dim',
		'--color-gold',
		'--color-gold-bright',
		'--color-text',
		'--color-text-dim',
		'--color-text-muted',
		'--color-success',
		'--color-error',
		'--color-cell-border'
	];
	let tokens: { name: string; value: string }[] = [];

	onMount(() => {
		const style = getComputedStyle(document.documentElement);
		tokens = tokenNames.map((name) => ({ name, value: style.getPropertyValue(name).trim() }));
	});

	// Motion replay
	let motionKey = 0;
	function replay() {
		motionKey += 1;
	}
</script>

<svelte:head>
	<title>Art Bible - Civil Sarabande</title>
</svelte:head>

<div class="container container--medium design">
	<header class="page-header">
		<h1>Art Bible</h1>
		<p class="page-subtitle">Watercolor beneath, pixel sprite above</p>
	</header>

	<div class="alert alert--info">
		Every specimen on this page is a procedural stand-in drawn to spec so engineering can build
		against the correct sizes today. Real assets replace them here first. The written spec is
		<code>docs/art-bible.md</code>.
	</div>

	<!-- ============================================================ -->
	<section class="card">
		<h2>1. Scale</h2>
		<p class="lede">
			One sprite pixel is two CSS pixels. Sprites are authored at 1× and shown at exactly 2×. The
			ladder below shows the numeral specimen at 1×, 2× (canonical) and 3× to make the rule
			visible. Nothing ships at a non-integer scale.
		</p>
		<div class="ladder">
			{#each [1, 2, 3] as scale}
				<div class="ladder-step">
					<div class="ladder-cell" class:ladder-cell--canonical={scale === 2}>
						<PixelSprite bitmap={NUMERAL_17} {scale} label="Numeral 17 at {scale}x" />
					</div>
					<span class="caption">{scale}× {scale === 2 ? '(canonical)' : ''}</span>
				</div>
			{/each}
		</div>
		<table class="spec-table">
			<thead>
				<tr><th>Class</th><th>Authored</th><th>Displayed</th></tr>
			</thead>
			<tbody>
				<tr><td>Suited numerals 1–36</td><td>24 × 24</td><td>48 × 48</td></tr>
				<tr><td>Player sigils</td><td>32 × 32</td><td>64 × 64</td></tr>
				<tr><td>Coins, cursor</td><td>12 × 12</td><td>24 × 24</td></tr>
				<tr><td>UI icons</td><td>16 × 16</td><td>32 × 32</td></tr>
				<tr><td>Damage digits</td><td>8 × 12</td><td>16 × 24</td></tr>
				<tr><td>Window 9-slice</td><td>8px corner, 4px edge</td><td>16px / 8px</td></tr>
				<tr><td>Watercolor backgrounds</td><td>2048 × 1536 painted</td><td>free scale</td></tr>
			</tbody>
		</table>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>2. Palette</h2>
		<p class="lede">
			Sprites use only these sixteen colors, hard-edged, no anti-aliasing. You are burgundy; the
			opponent is gold. Shading is at most four steps of one hue plus Ink 1 for outlines.
		</p>
		<div class="swatches">
			{#each spritePalette as c}
				<div class="swatch">
					<div class="swatch-chip" style="background: {c.hex}"></div>
					<div class="swatch-name">{c.name}</div>
					<div class="swatch-hex">{c.hex}</div>
					<div class="swatch-role">{c.role}</div>
				</div>
			{/each}
		</div>

		<h3>UI tokens (live from the stylesheet)</h3>
		<div class="swatches swatches--tokens">
			{#each tokens as t}
				<div class="swatch">
					<div class="swatch-chip" style="background: {t.value}"></div>
					<div class="swatch-name">{t.name.replace('--color-', '')}</div>
					<div class="swatch-hex">{t.value}</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>3. Specimens</h2>
		<p class="lede">Each at its displayed size, on both surfaces it must read against.</p>

		<div class="specimens">
			<div class="specimen">
				<div class="specimen-stage specimen-stage--dark">
					<PixelSprite bitmap={NUMERAL_17} scale={2} label="Numeral 17" />
				</div>
				<div class="specimen-stage specimen-stage--paper">
					<PixelSprite bitmap={NUMERAL_17} scale={2} label="Numeral 17 on parchment" />
				</div>
				<span class="caption">Suited numeral (24 × 24)</span>
			</div>

			<div class="specimen">
				<div class="specimen-stage specimen-stage--dark">
					<PixelSprite bitmap={COIN} scale={2} label="Coin" />
				</div>
				<div class="specimen-stage specimen-stage--paper">
					<PixelSprite bitmap={COIN} scale={2} label="Coin on parchment" />
				</div>
				<span class="caption">Coin (12 × 12)</span>
			</div>

			<div class="specimen">
				<div class="specimen-stage specimen-stage--dark">
					<PixelSprite bitmap={CURSOR} scale={2} label="Cursor" />
				</div>
				<div class="specimen-stage specimen-stage--paper">
					<PixelSprite bitmap={CURSOR} scale={2} label="Cursor on parchment" />
				</div>
				<span class="caption">Cursor (12 × 12)</span>
			</div>

			<div class="specimen">
				<div class="specimen-stage specimen-stage--dark">
					<svg class="sigil" viewBox="0 0 32 32" width="64" height="64" role="img" aria-label="Sample sigil">
						<rect x="0.5" y="0.5" width="31" height="31" fill="#6d2f38" stroke="#0d0a0e" />
						<rect x="2.5" y="2.5" width="27" height="27" fill="none" stroke="#c9a227" />
						<circle cx="16" cy="16" r="9" fill="none" stroke="#f5dc7a" stroke-width="1.5" />
						<path d="M16 7 L24 21 L8 21 Z" fill="none" stroke="#e6bb3a" stroke-width="1.5" />
						<circle cx="16" cy="16" r="2" fill="#f1e6cf" />
						<circle cx="16" cy="5" r="1" fill="#f5dc7a" />
						<circle cx="27" cy="16" r="1" fill="#f5dc7a" />
						<circle cx="5" cy="16" r="1" fill="#f5dc7a" />
						<circle cx="16" cy="27" r="1" fill="#f5dc7a" />
					</svg>
				</div>
				<div class="specimen-stage specimen-stage--paper">
					<svg class="sigil" viewBox="0 0 32 32" width="64" height="64" role="img" aria-label="Sample sigil on parchment">
						<rect x="0.5" y="0.5" width="31" height="31" fill="#6d2f38" stroke="#0d0a0e" />
						<rect x="2.5" y="2.5" width="27" height="27" fill="none" stroke="#c9a227" />
						<circle cx="16" cy="16" r="9" fill="none" stroke="#f5dc7a" stroke-width="1.5" />
						<path d="M16 7 L24 21 L8 21 Z" fill="none" stroke="#e6bb3a" stroke-width="1.5" />
						<circle cx="16" cy="16" r="2" fill="#f1e6cf" />
					</svg>
				</div>
				<span class="caption">Sigil (32 × 32)</span>
			</div>
		</div>

		<h3>Watercolor wash</h3>
		<p class="lede">
			The one non-pixel layer. Painted, wet-edged, 20 to 40 percent of a palette hue over
			parchment. This stand-in is generated with an SVG turbulence filter.
		</p>
		<div class="wash-row">
			<svg class="wash" viewBox="0 0 320 120" role="img" aria-label="Watercolor wash specimen">
				<defs>
					<filter id="bleed" x="-20%" y="-20%" width="140%" height="140%">
						<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="noise" />
						<feDisplacementMap in="SourceGraphic" in2="noise" scale="28" xChannelSelector="R" yChannelSelector="G" />
						<feGaussianBlur stdDeviation="1.2" />
					</filter>
					<filter id="grain">
						<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
						<feColorMatrix type="saturate" values="0" />
						<feComponentTransfer><feFuncA type="linear" slope="0.12" /></feComponentTransfer>
						<feComposite in2="SourceGraphic" operator="in" />
					</filter>
				</defs>
				<rect width="320" height="120" fill="#d9c8a5" />
				<rect width="320" height="120" fill="#f1e6cf" filter="url(#grain)" />
				<ellipse cx="110" cy="62" rx="88" ry="42" fill="#8b4049" opacity="0.32" filter="url(#bleed)" />
				<ellipse cx="215" cy="58" rx="80" ry="38" fill="#c9a227" opacity="0.34" filter="url(#bleed)" />
				<ellipse cx="160" cy="66" rx="40" ry="24" fill="#2a2230" opacity="0.18" filter="url(#bleed)" />
				<path d="M24 100 C 90 92, 150 108, 296 96" fill="none" stroke="#0d0a0e" stroke-opacity="0.8" stroke-width="1.6" stroke-linecap="round" />
			</svg>
		</div>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>4. Windows</h2>
		<p class="lede">
			Action panels become framed JRPG windows: a pixel-crisp double border with corner studs
			over a subtly painted interior. Three variants. These are CSS stand-ins for the 9-slice.
		</p>
		<div class="windows">
			<div class="jrpg-window jrpg-window--parchment">
				<div class="jrpg-title">Parchment</div>
				<p>Primary panels: moves, bets, results.</p>
			</div>
			<div class="jrpg-window jrpg-window--ink">
				<div class="jrpg-title">Ink</div>
				<p>Menus, modals, on-chain seals.</p>
			</div>
			<div class="jrpg-window jrpg-window--blood">
				<div class="jrpg-title">Blood</div>
				<p>Danger: fold, leave, forfeit.</p>
			</div>
		</div>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>5. Motion</h2>
		<p class="lede">
			Three presets from <code>$lib/motion</code>. Nothing else. Sprite animation runs at 8 to 12
			frames per second. All motion collapses to zero under reduced motion.
		</p>
		<button class="btn-secondary btn-sm" on:click={replay}>Replay</button>
		{#key motionKey}
			<div class="motion-row">
				<div class="motion-demo" in:quickFade>
					<div class="motion-chip">quickFade</div>
					<span class="caption">150ms · content swap</span>
				</div>
				<div class="motion-demo" in:panelIn={{ delay: 150 }}>
					<div class="motion-chip">panelIn</div>
					<span class="caption">220ms · rise 12px</span>
				</div>
				<div class="motion-demo" in:popIn={{ delay: 300 }}>
					<div class="motion-chip motion-chip--gold">popIn</div>
					<span class="caption">260ms · scale 0.85 with overshoot</span>
				</div>
			</div>
		{/key}
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>6. Layers</h2>
		<p class="lede">Back to front. An asset belongs to exactly one layer.</p>
		<div class="layers">
			<div class="layer layer--fx"><strong>FX</strong> damage numbers, reveal cast, seals</div>
			<div class="layer layer--sprite"><strong>Sprite</strong> numerals, sigils, coins, cursor, icons</div>
			<div class="layer layer--ink"><strong>Ink</strong> grid overlay, windows, ornaments</div>
			<div class="layer layer--wash"><strong>Wash</strong> watercolor backgrounds</div>
		</div>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>7. Typography</h2>
		<div class="type-samples">
			<div class="type-sample">
				<span class="caption">Display · Cinzel</span>
				<div class="type-display">Civil Sarabande</div>
			</div>
			<div class="type-sample">
				<span class="caption">Body · Crimson Text</span>
				<div class="type-body">Choose a column for yourself and assign a row to your opponent.</div>
			</div>
			<div class="type-sample">
				<span class="caption">Mono · JetBrains Mono</span>
				<div class="type-mono">0x8A3bC2f1D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9</div>
			</div>
			<div class="type-sample">
				<span class="caption">Pixel UI font · to commission</span>
				<div class="type-pixel">0123456789 CALL RAISE FOLD</div>
			</div>
		</div>
	</section>
</div>

<style>
	.design {
		max-width: 800px;
	}

	.lede {
		color: var(--color-text-dim);
	}

	.caption {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		letter-spacing: 0.03em;
	}

	h3 {
		margin-top: var(--space-xl);
	}

	code {
		font-family: var(--font-mono);
		font-size: 0.85em;
		color: var(--color-gold);
	}

	/* Scale ladder */
	.ladder {
		display: flex;
		gap: var(--space-xl);
		align-items: flex-end;
		margin: var(--space-lg) 0;
	}

	.ladder-step {
		text-align: center;
	}

	.ladder-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-sm);
		background: var(--color-cell-bg);
		border: 1px solid var(--color-cell-border);
		margin-bottom: var(--space-xs);
	}

	.ladder-cell--canonical {
		border-color: var(--color-gold);
		box-shadow: 0 0 0 1px var(--color-gold-dim);
	}

	.spec-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.spec-table th,
	.spec-table td {
		text-align: left;
		padding: var(--space-xs) var(--space-sm);
		border-bottom: 1px solid var(--color-cell-border);
	}

	.spec-table th {
		color: var(--color-text-dim);
		font-weight: 400;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.spec-table td:not(:first-child) {
		font-family: var(--font-mono);
		color: var(--color-gold);
	}

	/* Swatches */
	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-md);
	}

	.swatch-chip {
		height: 44px;
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-xs);
	}

	.swatch-name {
		font-size: 0.85rem;
	}

	.swatch-hex {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-gold);
	}

	.swatch-role {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* Specimens */
	.specimens {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-lg);
	}

	.specimen {
		text-align: center;
	}

	.specimen-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 88px;
		border: 1px solid var(--color-cell-border);
	}

	.specimen-stage--dark {
		background: var(--color-cell-bg);
	}

	.specimen-stage--paper {
		background: #d9c8a5;
		border-top: none;
		margin-bottom: var(--space-xs);
	}

	.sigil {
		shape-rendering: crispEdges;
	}

	.wash-row {
		border: 1px solid var(--color-cell-border);
	}

	.wash {
		display: block;
		width: 100%;
		height: auto;
	}

	/* Windows */
	.windows {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-lg);
	}

	.jrpg-window {
		position: relative;
		padding: var(--space-md);
		border: 2px solid #0d0a0e;
		box-shadow:
			0 0 0 2px var(--win-edge),
			0 0 0 4px #0d0a0e,
			inset 0 0 0 2px var(--win-inner);
		background: var(--win-fill);
		color: var(--win-text);
		image-rendering: pixelated;
	}

	.jrpg-window::before,
	.jrpg-window::after {
		content: '';
		position: absolute;
		width: 6px;
		height: 6px;
		background: var(--win-edge);
		box-shadow: 0 0 0 2px #0d0a0e;
	}

	.jrpg-window::before {
		top: -4px;
		left: -4px;
	}

	.jrpg-window::after {
		bottom: -4px;
		right: -4px;
	}

	.jrpg-window p {
		margin: 0;
		font-size: 0.9rem;
	}

	.jrpg-title {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.8rem;
		margin-bottom: var(--space-xs);
	}

	.jrpg-window--parchment {
		--win-fill: linear-gradient(160deg, #f1e6cf, #d9c8a5);
		--win-edge: #c9a227;
		--win-inner: #b8a27c;
		--win-text: #2a2230;
	}

	.jrpg-window--ink {
		--win-fill: linear-gradient(160deg, #2a2230, #0d0a0e);
		--win-edge: #e6bb3a;
		--win-inner: #4a3f52;
		--win-text: #f1e6cf;
	}

	.jrpg-window--blood {
		--win-fill: linear-gradient(160deg, #8b4049, #6d2f38);
		--win-edge: #f5dc7a;
		--win-inner: #a84545;
		--win-text: #f1e6cf;
	}

	/* Motion */
	.motion-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-lg);
		margin-top: var(--space-md);
	}

	.motion-demo {
		text-align: center;
	}

	.motion-chip {
		display: inline-block;
		padding: var(--space-sm) var(--space-lg);
		background: var(--color-primary);
		color: var(--color-text);
		font-family: var(--font-display);
		letter-spacing: 0.05em;
		border-radius: var(--radius-md);
		margin-bottom: var(--space-xs);
	}

	.motion-chip--gold {
		background: var(--color-gold);
		color: var(--color-bg-dark);
	}

	/* Layers */
	.layers {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.layer {
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-cell-border);
		font-size: 0.875rem;
		color: var(--color-text-dim);
	}

	.layer strong {
		display: inline-block;
		width: 64px;
		color: var(--color-text);
		font-family: var(--font-display);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.layer--fx { background: rgba(201, 162, 39, 0.12); }
	.layer--sprite { background: rgba(139, 64, 73, 0.18); }
	.layer--ink { background: rgba(42, 34, 48, 0.8); }
	.layer--wash { background: linear-gradient(90deg, rgba(217, 200, 165, 0.25), rgba(139, 64, 73, 0.15)); }

	/* Typography */
	.type-samples {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}

	.type-display {
		font-family: var(--font-display);
		font-size: 2rem;
		color: var(--color-gold);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.type-body {
		font-family: var(--font-body);
		font-size: 1.1rem;
	}

	.type-mono {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		word-break: break-all;
	}

	.type-pixel {
		font-family: var(--font-mono);
		font-size: 1rem;
		letter-spacing: 0.15em;
		color: var(--color-text-dim);
		font-style: italic;
	}

	@media (max-width: 600px) {
		.ladder {
			gap: var(--space-md);
		}
	}
</style>
