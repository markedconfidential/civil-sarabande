<script lang="ts">
	/**
	 * On-chain status seal: an SVG wax seal in five states.
	 *
	 *   pending   — outline only, with a slow hourglass tick (waiting on the user)
	 *   stamping  — the seal presses down, repeatedly (transaction in flight)
	 *   sealed    — full burgundy wax with the gold sigil (funds locked)
	 *   released  — the seal cracked open, gold showing through (paid out)
	 *   failed    — blood-red wax split by a black crack (reverted)
	 *
	 * Props and slots are the contract; only the rendering changed in the
	 * art pass.
	 */
	export let state: 'pending' | 'stamping' | 'sealed' | 'released' | 'failed' = 'pending';
	export let label = '';
	export let detail = '';
	/** Optional link (e.g. block explorer transaction page) */
	export let href: string | null = null;

	// Irregular wax blob, centred at 24,24 in a 48 box
	const WAX =
		'M24 4 C 30 3, 36 6, 40 11 C 44 16, 45 22, 43 28 C 42 34, 38 40, 32 43 C 26 46, 18 45, 12 41 C 7 37, 4 31, 4 25 C 4 18, 8 11, 14 7 C 17 5, 20 4, 24 4 Z';
	const SIGIL =
		'M24 12 L33 24 L24 36 L15 24 Z M24 18 L29 24 L24 30 L19 24 Z';
	const CRACK = 'M23 5 L21 13 L26 19 L20 27 L27 33 L23 43';

	$: showWax = state !== 'pending';
	$: cracked = state === 'released' || state === 'failed';
</script>

<div class="seal seal--{state}" role="status" aria-live="polite">
	<span class="seal-mark" aria-hidden="true">
		<svg viewBox="0 0 48 48" width="48" height="48" class="seal-svg">
			<!-- paper ring under the wax -->
			<circle cx="24" cy="24" r="21" fill="none" stroke="var(--seal-ring)" stroke-width="1.5" stroke-dasharray={state === 'pending' ? '3 3' : 'none'} />

			{#if state === 'pending'}
				<g class="hourglass">
					<path d="M17 13 H31 M17 35 H31 M18 13 L30 35 M30 13 L18 35" fill="none" stroke="var(--seal-ring)" stroke-width="1.5" stroke-linecap="round" />
					<path d="M20 16 L28 16 L24 22 Z" fill="var(--seal-ring)" />
				</g>
			{/if}

			{#if showWax}
				<g class="wax" class:wax--stamping={state === 'stamping'}>
					<path d={WAX} fill="var(--seal-wax-shadow)" transform="translate(1.5 2)" />
					<path d={WAX} fill="var(--seal-wax)" stroke="#0d0a0e" stroke-width="1.2" />
					<path d={WAX} fill="none" stroke="var(--seal-wax-light)" stroke-width="1" transform="translate(-1 -1.5) scale(0.9) translate(2.5 3)" opacity="0.7" />
					<path d={SIGIL} fill="var(--seal-sigil)" fill-rule="evenodd" />
					{#if cracked}
						<path d={CRACK} fill="none" stroke="var(--seal-crack)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
						<path d={CRACK} fill="none" stroke="var(--seal-crack-light)" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(1 0)" />
					{/if}
				</g>
			{/if}
		</svg>
	</span>
	<span class="seal-text">
		{#if label}<span class="seal-label">{label}</span>{/if}
		{#if detail}<span class="seal-detail">{detail}</span>{/if}
		{#if href}<a class="seal-link" {href} target="_blank" rel="noopener">View transaction</a>{/if}
	</span>
</div>

<style>
	.seal {
		display: inline-flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		font-size: 0.85rem;
		--seal-ring: #b8a27c;
		--seal-wax: #8b4049;
		--seal-wax-shadow: rgba(13, 10, 14, 0.45);
		--seal-wax-light: #d08090;
		--seal-sigil: #c9a227;
		--seal-crack: #0d0a0e;
		--seal-crack-light: #f5dc7a;
	}

	.seal-mark {
		flex-shrink: 0;
		line-height: 0;
	}

	.seal-svg {
		display: block;
		overflow: visible;
	}

	.seal--pending {
		--seal-ring: #9a7d1c;
	}

	.seal--pending .hourglass {
		transform-origin: 24px 24px;
		animation: seal-tick 4s steps(1, end) infinite;
	}

	@keyframes seal-tick {
		0%,
		45% {
			transform: rotate(0deg);
		}
		50%,
		95% {
			transform: rotate(180deg);
		}
	}

	.seal--stamping {
		--seal-wax: #a85560;
	}

	.wax--stamping {
		transform-origin: 24px 24px;
		animation: seal-press 1.1s cubic-bezier(0.6, 0, 0.3, 1) infinite;
	}

	@keyframes seal-press {
		0% {
			transform: translateY(-10px) scale(1.18);
			opacity: 0.55;
		}
		40% {
			transform: translateY(0) scale(0.96);
			opacity: 1;
		}
		55% {
			transform: translateY(0) scale(1);
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}

	.seal--sealed {
		--seal-wax: #8b4049;
	}

	.seal--released {
		--seal-wax: #6d2f38;
		--seal-sigil: #f5dc7a;
		--seal-crack: #c9a227;
		--seal-crack-light: #f5dc7a;
		--seal-ring: #c9a227;
	}

	.seal--released .seal-svg {
		filter: drop-shadow(0 0 6px rgba(201, 162, 39, 0.55));
	}

	.seal--failed {
		--seal-wax: #a84545;
		--seal-wax-light: #c25555;
		--seal-sigil: #2a2230;
		--seal-crack: #0d0a0e;
		--seal-crack-light: #d08090;
		--seal-ring: #a84545;
	}

	.seal-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.seal-label {
		font-family: var(--font-display);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.seal--released .seal-label {
		color: var(--color-gold);
	}

	.seal--failed .seal-label {
		color: var(--color-error);
	}

	.seal-detail {
		color: var(--color-text-dim);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.seal-link {
		font-size: 0.75rem;
		font-family: var(--font-mono);
	}
</style>
