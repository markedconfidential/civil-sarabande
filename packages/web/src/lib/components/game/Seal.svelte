<script lang="ts">
	/**
	 * On-chain status seal.
	 *
	 * States follow the escrow lifecycle from docs/ui-art-direction.md:
	 *   pending   — waiting for the user (approve / sign)
	 *   stamping  — transaction submitted, awaiting confirmation
	 *   sealed    — confirmed on chain (funds locked)
	 *   released  — settlement confirmed (funds paid out)
	 *   failed    — reverted or errored
	 *
	 * Placeholder visuals; the art pass replaces the rendering while keeping
	 * these props.
	 */
	export let state: 'pending' | 'stamping' | 'sealed' | 'released' | 'failed' = 'pending';
	export let label = '';
	export let detail = '';
	/** Optional link (e.g. block explorer transaction page) */
	export let href: string | null = null;
</script>

<div class="seal seal--{state}" role="status" aria-live="polite">
	<span class="seal-mark" aria-hidden="true"></span>
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
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-md);
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-md);
		background: var(--color-bg-elevated);
		font-size: 0.85rem;
	}

	.seal-mark {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--color-text-muted);
		flex-shrink: 0;
	}

	.seal--pending .seal-mark {
		background: var(--color-gold-dim);
	}

	.seal--stamping .seal-mark {
		background: var(--color-gold);
		animation: pulse 1s ease-in-out infinite;
	}

	.seal--sealed .seal-mark {
		background: var(--color-primary-light);
	}

	.seal--released .seal-mark {
		background: var(--color-success);
	}

	.seal--failed .seal-mark {
		background: var(--color-error);
	}

	.seal-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.seal-label {
		font-family: var(--font-display);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		font-size: 0.75rem;
	}

	.seal-detail {
		color: var(--color-text-dim);
		font-size: 0.8rem;
	}

	.seal-link {
		font-size: 0.75rem;
	}
</style>
