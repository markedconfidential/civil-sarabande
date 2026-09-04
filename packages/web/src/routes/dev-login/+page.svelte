<script lang="ts">
	/**
	 * Dev-mode sign-in: pick one of four preset Anvil identities.
	 * Only available when VITE_AUTH_MODE=dev.
	 */
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { authStore } from '$lib/auth';
	import { DEV_IDENTITIES, type DevIdentity } from '$lib/dev/identities';
	import { loginAsDevIdentity, type DevLoginStep } from '$lib/dev/login';
	import { unitsToUsdc } from '@civil-sarabande/shared';

	const isDev = config.authMode === 'dev';

	let busy: string | null = null;
	let step: DevLoginStep | null = null;
	let error: string | null = null;
	let warnings: string[] = [];

	const STEP_TEXT: Record<DevLoginStep, string> = {
		auth: 'Signing in',
		wallet: 'Registering wallet with the server',
		username: 'Checking username',
		balance: 'Reading USDC balance',
		faucet: 'Minting test USDC from the faucet'
	};

	async function choose(identity: DevIdentity) {
		if (busy) return;
		busy = identity.userId;
		error = null;
		warnings = [];
		try {
			const result = await loginAsDevIdentity(identity, (s) => (step = s));
			warnings = result.warnings;
			if (warnings.length === 0) {
				await goto('/');
				return;
			}
			// Signed in, but something was off; let the player read the warnings.
			signedInAs = identity;
			signedInBalance = result.balanceUnits;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign-in failed';
			authStore.logout();
		} finally {
			busy = null;
			step = null;
		}
	}

	let signedInAs: DevIdentity | null = null;
	let signedInBalance: bigint | null = null;

	function shortAddress(address: string): string {
		return `${address.slice(0, 6)}…${address.slice(-4)}`;
	}
</script>

<svelte:head>
	<title>Dev Sign-In - Civil Sarabande</title>
</svelte:head>

<div class="container container--medium">
	<header class="page-header">
		<h1>Civil Sarabande</h1>
		<p class="page-subtitle">Local table — choose who you are tonight</p>
	</header>

	{#if !isDev}
		<div class="card">
			<div class="alert alert--warning">
				Dev sign-in is disabled: this build uses <code>VITE_AUTH_MODE={config.authMode}</code>.
			</div>
			<a href="/" class="btn-secondary">Return Home</a>
		</div>
	{:else}
		{#if error}
			<div class="alert alert--error">{error}</div>
		{/if}

		{#if $authStore.devIdentity && !busy}
			<div class="alert alert--info">
				Currently signed in as <strong>{$authStore.devIdentity.name}</strong>. Pick another identity
				to switch, or <a href="/">go to the lobby</a>.
			</div>
		{/if}

		<div class="card">
			<h2>Dev identities</h2>
			<p class="card-intro">
				Anvil accounts 0 to 3. Open a second browser (or a private window) and pick a different
				one to play against yourself.
			</p>

			<div class="identity-grid">
				{#each DEV_IDENTITIES as identity}
					<button
						type="button"
						class="identity-card"
						class:identity-card--busy={busy === identity.userId}
						disabled={busy !== null}
						on:click={() => choose(identity)}
					>
						<span class="identity-index">#{identity.index}</span>
						<span class="identity-name">{identity.name}</span>
						<code class="identity-address" title={identity.address}>
							{shortAddress(identity.address)}
						</code>
						{#if busy === identity.userId && step}
							<span class="identity-step">{STEP_TEXT[step]}…</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		{#if warnings.length > 0}
			<div class="card">
				<h2>Signed in{signedInAs ? ` as ${signedInAs.name}` : ''}, with warnings</h2>
				{#if signedInBalance !== null}
					<p class="card-intro">USDC balance: <strong>{unitsToUsdc(signedInBalance)}</strong></p>
				{/if}
				<ul class="warning-list">
					{#each warnings as warning}
						<li class="alert alert--warning">{warning}</li>
					{/each}
				</ul>
				<a href="/" class="btn-gold">Continue to the lobby</a>
			</div>
		{/if}
	{/if}
</div>

<style>
	.card-intro {
		color: var(--color-text-dim);
		margin-bottom: var(--space-lg);
	}

	.identity-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-md);
	}

	.identity-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-xs);
		padding: var(--space-md);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-cell-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.identity-card:hover:not(:disabled) {
		border-color: var(--color-gold);
	}

	.identity-card:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.identity-card--busy {
		border-color: var(--color-gold);
		opacity: 1;
	}

	.identity-index {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.identity-name {
		font-family: var(--font-display);
		font-size: 1.25rem;
		color: var(--color-gold);
	}

	.identity-address {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-text-dim);
	}

	.identity-step {
		margin-top: var(--space-xs);
		font-size: 0.8rem;
		color: var(--color-text-dim);
		font-style: italic;
	}

	.warning-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-md) 0;
	}
</style>
