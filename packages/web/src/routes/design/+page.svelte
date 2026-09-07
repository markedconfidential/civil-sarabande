<script lang="ts">
	import { onMount } from 'svelte';
	import { panelIn, popIn, quickFade } from '$lib/motion';
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { COIN, CURSOR } from '$lib/design/specimens';
	import { numeralBitmap, numeralSheet, SUITS } from '$lib/art/numerals';
	import { sigilSpec } from '$lib/art/sigil';
	import { PARCHMENT_URL } from '$lib/art/surfaces';
	import Numeral from '$lib/components/art/Numeral.svelte';
	import PlayerSigil from '$lib/components/art/PlayerSigil.svelte';
	import CoinStack from '$lib/components/art/CoinStack.svelte';
	import DamageNumber from '$lib/components/art/DamageNumber.svelte';
	import ResultCrest from '$lib/components/art/ResultCrest.svelte';
	import JRPGWindow from '$lib/components/art/JRPGWindow.svelte';
	import Seal from '$lib/components/game/Seal.svelte';
	import Countdown from '$lib/components/game/Countdown.svelte';

	const NUMERAL_17 = numeralBitmap(17);
	const sheet = numeralSheet();
	const sigilSeeds = ['did:privy:cm1a2b3c4d', '0x8A3bC2f1D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9', 'preview'];
	const sealStates = ['pending', 'stamping', 'sealed', 'released', 'failed'] as const;
	let countdownDeadline = 0;
	let fxKey = 0;
	function replayFx() {
		fxKey += 1;
		countdownDeadline = Date.now() + 95_000;
	}

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
		countdownDeadline = Date.now() + 95_000;
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
		Every asset here is the one the live game renders, generated to spec: numerals, sigils,
		coins, windows, seals and washes come from <code>$lib/art</code> and
		<code>$lib/components</code>. The written spec is <code>docs/art-bible.md</code>.
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
				<tr><td>Watercolor backgrounds</td><td>2048 × 1536 SVG</td><td>free scale</td></tr>
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
					<Numeral value={17} tone="paper" />
				</div>
				<div class="specimen-stage specimen-stage--paper" style="background-image:{PARCHMENT_URL}">
					<Numeral value={17} />
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
					<PlayerSigil seed={sigilSeeds[0]} size={64} />
				</div>
				<div class="specimen-stage specimen-stage--paper">
					<PlayerSigil seed={sigilSeeds[0]} size={64} label="Sigil on parchment" />
				</div>
				<span class="caption">Sigil (32 × 32)</span>
			</div>
		</div>

		<h3>Numeral sheet, 1–36</h3>
		<p class="lede">
			Six suits by six ranks: Moon, Star, Chalice, Blade, Wand, Crown. Digits from a 5 × 7
			font doubled to 10 × 14, the suit motif bottom-left, rank pips bottom-right. Ink on
			parchment as on the board.
		</p>
		<div class="numeral-sheet" style="background-image:{PARCHMENT_URL}">
			{#each sheet as n}
				<div class="numeral-cell" title="{n.value} · {SUITS[Math.floor((n.value - 1) / 6)]}">
					<Numeral value={n.value} />
				</div>
			{/each}
		</div>
		<div class="suit-legend">
			{#each SUITS as suit, i}
				<span class="caption">{i * 6 + 1}–{i * 6 + 6} {suit}</span>
			{/each}
		</div>

		<h3>Sigils</h3>
		<p class="lede">
			Generated from the player id or wallet: FNV-1a hash, mirrored 16 × 32 half, a ground
			and figure family from burgundy, gold, parchment and verdant, always a 1px Ink border.
		</p>
		<div class="sigil-row">
			{#each sigilSeeds as seed}
				<div class="sigil-sample">
					<PlayerSigil {seed} size={64} />
					<PlayerSigil {seed} size={32} />
					<span class="caption">{sigilSpec(seed).ground} / {sigilSpec(seed).figure} · {sigilSpec(seed).shape}</span>
					<span class="caption seed">{seed.length > 18 ? seed.slice(0, 18) + '…' : seed}</span>
				</div>
			{/each}
		</div>

		<h3>Coin stacks</h3>
		<p class="lede">One sprite per ten coins in columns of five, loose coins after; at most twelve sprites.</p>
		<div class="coin-row">
			{#each [0, 3, 10, 27, 64, 100] as n}
				<div class="coin-sample"><CoinStack count={n} /></div>
			{/each}
		</div>

		<h3>Watercolor wash</h3>
		<p class="lede">
			The one non-pixel layer. Painted, wet-edged, 20 to 40 percent of a palette hue over
			parchment. The page backgrounds are generated the same way by
			<code>src/lib/art/generate-backgrounds.ts</code>.
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
		<div class="bg-row">
			{#each ['lobby', 'duel', 'settlement'] as name}
				<div class="bg-sample">
					<img src="/art/backgrounds/{name}.svg" alt="{name} background" />
					<span class="caption">{name}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ============================================================ -->
	<section class="card">
		<h2>4. Windows</h2>
		<p class="lede">
			Action panels are framed JRPG windows: a pixel double border with corner studs over a
			painted interior. <code>.card</code> and <code>.action-panel</code> are parchment by
			default; <code>.card--ink</code> and <code>.card--blood</code> switch variants, and
			<code>JRPGWindow</code> wraps any content.
		</p>
		<div class="windows">
			<JRPGWindow variant="parchment" title="Parchment">
				<p>Primary panels: moves, bets, results.</p>
				<div class="window-buttons"><button class="btn-primary btn-sm">Confirm</button><button class="btn-gold btn-sm">Reveal</button></div>
			</JRPGWindow>
			<JRPGWindow variant="ink" title="Ink">
				<p>Status chrome: players, pot, phase, seals.</p>
				<div class="window-buttons"><button class="btn-secondary btn-sm">Leave</button></div>
			</JRPGWindow>
			<JRPGWindow variant="blood" title="Blood">
				<p>Danger: fold, leave, forfeit.</p>
				<div class="window-buttons"><button class="btn-danger btn-sm">Fold</button></div>
			</JRPGWindow>
		</div>

		<h3>Seals</h3>
		<p class="lede">On-chain status as a wax seal. Five states; the transaction link sits beside the detail.</p>
		<div class="seal-grid">
			{#each sealStates as st}
				<div class="seal-sample">
					<Seal
						state={st}
						label={st === 'pending' ? 'Awaiting settlement' : st === 'stamping' ? 'Settling on chain' : st === 'sealed' ? 'Stake locked' : st === 'released' ? 'Settled' : 'Settlement failed'}
						detail={st === 'released' ? 'You receive 1.5 USDC · They receive 0.5 USDC' : st === 'failed' ? 'execution reverted' : st === 'stamping' ? 'Waiting for confirmation' : ''}
						href={st === 'released' ? 'https://sepolia.basescan.org/tx/0x0' : null}
					/>
					<span class="caption">{st}</span>
				</div>
			{/each}
		</div>

		<h3>FX</h3>
		<p class="lede">Countdown ring, floating damage numbers, and the round-result crest.</p>
		<button class="btn-secondary btn-sm" on:click={replayFx}>Replay</button>
		{#key fxKey}
			<div class="fx-row">
				<div class="fx-sample">
					<Countdown deadline={countdownDeadline} yourTurn={true} />
					<Countdown deadline={Date.now() + 12_000} yourTurn={false} />
					<span class="caption">Countdown · yours / urgent</span>
				</div>
				<div class="fx-sample fx-sample--dark">
					<div class="fx-numbers">
						<DamageNumber value={17} tone="you" />
						<DamageNumber value={-4} tone="them" delay={200} />
						<DamageNumber value={36} tone="neutral" signed={false} delay={400} />
					</div>
					<span class="caption">Damage numbers · you / them / neutral</span>
				</div>
				<div class="fx-sample fx-sample--dark">
					<ResultCrest roundNumber={3} outcome="you" potWon={12} />
					<ResultCrest roundNumber={4} outcome="them" potWon={8} byFold={true} delay={150} />
					<ResultCrest roundNumber={5} outcome="tie" delay={300} />
					<span class="caption">Result crest</span>
				</div>
			</div>
		{/key}
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
				<span class="caption">Display · Cinzel 600/700 (Google Fonts, loaded in app.html)</span>
				<div class="type-display">Civil Sarabande</div>
			</div>
			<div class="type-sample">
				<span class="caption">Body · Crimson Text 400/400i/600 (Google Fonts)</span>
				<div class="type-body">Choose a column for yourself and assign a row to your opponent.</div>
			</div>
			<div class="type-sample">
				<span class="caption">Mono · JetBrains Mono 400/500 (Google Fonts)</span>
				<div class="type-mono">0x8A3bC2f1D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9</div>
			</div>
			<div class="type-sample">
				<span class="caption">Pixel digits · the 5 × 7 numeral font, outlined, as used for damage numbers</span>
				<div class="type-pixel"><DamageNumber value="0123456789" tone="neutral" signed={false} /></div>
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

	.windows :global(.jrpg-window) {
		margin: 4px;
	}

	.windows :global(.jrpg-window p) {
		margin: 0 0 var(--space-sm) 0;
		font-size: 0.9rem;
	}

	.window-buttons {
		display: flex;
		gap: var(--space-sm);
	}

	.numeral-sheet {
		display: grid;
		grid-template-columns: repeat(6, 56px);
		gap: 4px;
		justify-content: center;
		padding: var(--space-md);
		background-color: #d9c8a5;
		border: 2px solid #0d0a0e;
		box-shadow: 0 0 0 2px #9a7d1c, 0 0 0 4px #0d0a0e;
		margin: var(--space-md) auto;
		width: max-content;
		max-width: 100%;
		overflow-x: auto;
	}

	.numeral-cell {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		outline: 1px solid rgba(13, 10, 14, 0.35);
	}

	.suit-legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-sm) var(--space-md);
	}

	.sigil-row,
	.coin-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xl);
		align-items: flex-end;
	}

	.sigil-sample {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-sm);
	}

	.seed {
		font-size: 0.65rem;
	}

	.coin-sample {
		padding: var(--space-sm);
		background: #1a1520;
		border: 2px solid #0d0a0e;
	}

	.bg-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-md);
		margin-top: var(--space-md);
	}

	.bg-sample img {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border: 2px solid #0d0a0e;
	}

	.seal-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-md);
	}

	.seal-sample {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.seal-sample :global(.seal) {
		background: #1a1520;
		border: 2px solid #0d0a0e;
		color: #e8e4eb;
		box-shadow: 0 0 0 1px #4a3f52;
	}

	.seal-sample :global(.seal .seal-detail) {
		color: #9a9498;
	}

	.fx-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-lg);
		margin-top: var(--space-md);
	}

	.fx-sample {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		align-items: flex-start;
	}

	.fx-sample--dark {
		background: #1a1520;
		padding: var(--space-md);
		border: 2px solid #0d0a0e;
	}

	.fx-numbers {
		display: flex;
		gap: var(--space-lg);
		height: 60px;
		align-items: flex-end;
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
		display: inline-block;
		padding: var(--space-sm);
		background: #1a1520;
		border: 2px solid #0d0a0e;
	}

	@media (max-width: 600px) {
		.ladder {
			gap: var(--space-md);
		}
	}
</style>
