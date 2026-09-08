<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, isLoading, walletAddress } from '$lib/auth';
	import { login } from '$lib/privy';
	import { addressUrl, chainName, config } from '$lib/config';
	import { faucet } from '$lib/api';
	import { getUsdcBalance, toChainErrorMessage } from '$lib/chain';
	import { DEV_FAUCET_AMOUNT } from '$lib/dev/login';
	import { unitsToUsdc } from '@civil-sarabande/shared';
	import type { Address } from 'viem';

	const isDev = config.authMode === 'dev';
	const isLocal = config.chainId === 31337;

	let balance: string | null = null;
	let loadingBalance = true;
	let error: string | null = null;
	let copied = false;
	let fauceting = false;
	let faucetError: string | null = null;

	$: if ($isAuthenticated && $walletAddress && !$isLoading) {
		fetchBalance();
	}

	onMount(() => {
		// Redirect to home if not authenticated after loading
		const unsub = isLoading.subscribe((loading) => {
			if (!loading && !$isAuthenticated) {
				goto('/');
			}
		});
		return unsub;
	});

	async function fetchBalance() {
		if (!$walletAddress) return;
		loadingBalance = true;
		error = null;

		try {
			const units = await getUsdcBalance($walletAddress as Address);
			balance = unitsToUsdc(units);
		} catch (err) {
			error = toChainErrorMessage(err);
		}

		loadingBalance = false;
	}

	async function requestFaucet() {
		if (!$walletAddress || fauceting) return;
		fauceting = true;
		faucetError = null;
		try {
			await faucet($walletAddress, DEV_FAUCET_AMOUNT);
			await fetchBalance();
		} catch (err) {
			faucetError = err instanceof Error ? err.message : 'Faucet failed';
		}
		fauceting = false;
	}

	async function copyAddress() {
		if ($walletAddress) {
			await navigator.clipboard.writeText($walletAddress);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}
</script>

<svelte:head>
	<title>Fund Your Wallet - Civil Sarabande</title>
</svelte:head>

<div class="container container--medium">
	<header class="page-header">
		<h1>Fund Your Wallet</h1>
		<p class="page-subtitle">USDC on {chainName()} is the only coin at this table</p>
	</header>

	{#if $isLoading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading...</p>
		</div>
	{:else if !$isAuthenticated}
		<div class="card auth-card">
			<h2>Welcome</h2>
			<p>Please sign in to access your wallet.</p>
			<button type="button" on:click={login} class="btn-gold btn-lg">Sign In</button>
		</div>
	{:else}
		<div class="card">
			<h2>Your Wallet</h2>

			{#if $walletAddress}
				<div class="form-group">
					<label for="wallet-address">Wallet Address ({chainName()})</label>
					<div class="address-row">
						<code id="wallet-address" class="code-box">{$walletAddress}</code>
						<button type="button" on:click={copyAddress} class="btn-secondary btn-sm">
							{copied ? 'Copied' : 'Copy'}
						</button>
					</div>
					{#if addressUrl($walletAddress)}
						<p class="field-hint">
							<a href={addressUrl($walletAddress)} target="_blank" rel="noopener">View on explorer</a>
						</p>
					{/if}
				</div>
			{:else}
				<div class="alert alert--warning">No wallet address found. Please refresh the page.</div>
			{/if}

			<div class="stat-box balance-box">
				<div class="stat-label">USDC Balance</div>
				{#if loadingBalance}
					<div class="stat-value stat-value--dim">Loading...</div>
				{:else if error}
					<div class="alert alert--error">{error}</div>
					<button type="button" on:click={fetchBalance} class="btn-secondary btn-sm">Retry</button>
				{:else if balance !== null}
					<div class="stat-value stat-value--gold">{balance} <span class="unit">USDC</span></div>
					<div class="balance-actions">
						<button type="button" on:click={fetchBalance} class="btn-secondary btn-sm">Refresh</button>
						{#if isDev}
							<button
								type="button"
								on:click={requestFaucet}
								class="btn-gold btn-sm"
								disabled={fauceting}
							>
								{fauceting ? 'Minting…' : `Faucet: +${DEV_FAUCET_AMOUNT} USDC`}
							</button>
						{/if}
					</div>
					{#if faucetError}
						<div class="alert alert--error">{faucetError}</div>
					{/if}
				{/if}
			</div>
		</div>

		{#if isLocal}
			<div class="card">
				<h2>Local chain</h2>
				<p class="card-intro">
					You are on a local Anvil chain with mock USDC. There is nothing to bridge: use the
					faucet above to mint test USDC into this wallet.
				</p>
			</div>
		{:else}
			<div class="card">
				<h2>How to Fund Your Wallet</h2>
				<ol class="steps">
					<li class="step">
						<span class="step-num">1</span>
						<div>
							<strong>Get test USDC on Base Sepolia</strong>
							<p>
								Request Base Sepolia USDC from
								<a href="https://faucet.circle.com" target="_blank" rel="noopener">Circle's faucet</a>
								and a little Sepolia ETH for gas from a Base Sepolia faucet.
							</p>
						</div>
					</li>
					<li class="step">
						<span class="step-num">2</span>
						<div>
							<strong>Send to Your Wallet Address</strong>
							<p>Copy your wallet address above and send USDC on {chainName()} to it.</p>
						</div>
					</li>
					<li class="step">
						<span class="step-num">3</span>
						<div>
							<strong>Refresh</strong>
							<p>Press Refresh above once the transfer is confirmed.</p>
						</div>
					</li>
				</ol>

				<div class="alert alert--warning network-warning">
					<strong>Important:</strong> Only send USDC on {chainName()} to this address. Sending other
					tokens or using the wrong network may result in lost funds.
				</div>
			</div>
		{/if}

		<div class="actions">
			<a href="/" class="btn-secondary">Back to Home</a>
		</div>
	{/if}
</div>

<style>
	.auth-card {
		text-align: center;
	}

	.auth-card p,
	.card-intro {
		color: var(--color-text-dim);
		margin-bottom: var(--space-lg);
	}

	.address-row {
		display: flex;
		gap: var(--space-sm);
		align-items: stretch;
	}

	.address-row .code-box {
		flex: 1;
		display: flex;
		align-items: center;
	}

	.balance-box {
		margin-top: var(--space-lg);
	}

	.balance-box .stat-value {
		margin-bottom: var(--space-md);
	}

	.balance-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: var(--space-sm);
	}

	.stat-value--dim {
		color: var(--color-text-dim);
	}

	.unit {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--color-gold-dim);
		letter-spacing: 0.1em;
	}

	.network-warning {
		margin-top: var(--space-xl);
		margin-bottom: 0;
	}

	.actions {
		text-align: center;
	}

	@media (max-width: 600px) {
		.address-row {
			flex-direction: column;
		}
	}
</style>
