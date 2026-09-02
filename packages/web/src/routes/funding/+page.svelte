<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, isLoading, walletAddress } from '$lib/auth';
	import { login, getAccessToken } from '$lib/privy';

	let balance: string | null = null;
	let loadingBalance = true;
	let error: string | null = null;
	let copied = false;

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
		loadingBalance = true;
		error = null;

		try {
			const token = await getAccessToken();
			if (!token) {
				error = 'Failed to get authentication token';
				loadingBalance = false;
				return;
			}

			const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
			const response = await fetch(`${API_URL}/wallet/balance`, {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error || 'Failed to fetch balance';
				loadingBalance = false;
				return;
			}

			const data = await response.json();
			balance = data.balance;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch balance';
		}

		loadingBalance = false;
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
		<p class="page-subtitle">USDC on Base is the only coin at this table</p>
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
					<label for="wallet-address">Wallet Address (Base Network)</label>
					<div class="address-row">
						<code id="wallet-address" class="code-box">{$walletAddress}</code>
						<button type="button" on:click={copyAddress} class="btn-secondary btn-sm">
							{copied ? 'Copied' : 'Copy'}
						</button>
					</div>
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
					<button type="button" on:click={fetchBalance} class="btn-secondary btn-sm">Refresh</button>
				{/if}
			</div>
		</div>

		<div class="card">
			<h2>How to Fund Your Wallet</h2>
			<ol class="steps">
				<li class="step">
					<span class="step-num">1</span>
					<div>
						<strong>Get USDC on Base Network</strong>
						<p>
							You can purchase USDC on exchanges like Coinbase or Binance, then withdraw to your
							wallet address on the Base network.
						</p>
					</div>
				</li>
				<li class="step">
					<span class="step-num">2</span>
					<div>
						<strong>Bridge USDC to Base</strong>
						<p>
							If you have USDC on another network (Ethereum, Polygon, etc.), you can use a bridge
							like <a href="https://bridge.base.org" target="_blank" rel="noopener">Base Bridge</a> to
							transfer it to Base.
						</p>
					</div>
				</li>
				<li class="step">
					<span class="step-num">3</span>
					<div>
						<strong>Send to Your Wallet Address</strong>
						<p>Copy your wallet address above and send USDC on the Base network to it.</p>
					</div>
				</li>
			</ol>

			<div class="alert alert--warning network-warning">
				<strong>Important:</strong> Only send USDC on the Base network to this address. Sending
				other tokens or using the wrong network may result in lost funds.
			</div>
		</div>

		<div class="actions">
			<a href="/" class="btn-secondary">Back to Home</a>
		</div>
	{/if}
</div>

<style>
	.auth-card {
		text-align: center;
	}

	.auth-card p {
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
