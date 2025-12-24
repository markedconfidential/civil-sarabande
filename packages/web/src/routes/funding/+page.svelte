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

<div class="container">
	<h1>Fund Your Wallet</h1>

	{#if $isLoading}
		<p>Loading...</p>
	{:else if !$isAuthenticated}
		<div class="auth-section">
			<p>Please sign in to access your wallet.</p>
			<button type="button" on:click={login} class="primary-button"> Sign In </button>
		</div>
	{:else}
		<div class="wallet-section">
			<h2>Your Wallet</h2>

			{#if $walletAddress}
				<div class="wallet-address">
					<span class="label-text">Wallet Address (Base Network)</span>
					<div class="address-row">
						<code>{$walletAddress}</code>
						<button type="button" on:click={copyAddress} class="copy-button">
							{copied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>
			{:else}
				<p class="warning">No wallet address found. Please refresh the page.</p>
			{/if}

			<div class="balance-section">
				<h3>USDC Balance</h3>
				{#if loadingBalance}
					<p>Loading balance...</p>
				{:else if error}
					<p class="error">{error}</p>
					<button type="button" on:click={fetchBalance} class="secondary-button">
						Retry
					</button>
				{:else if balance !== null}
					<p class="balance">{balance} USDC</p>
					<button type="button" on:click={fetchBalance} class="secondary-button">
						Refresh
					</button>
				{/if}
			</div>

			<div class="instructions">
				<h3>How to Fund Your Wallet</h3>
				<ol>
					<li>
						<strong>Get USDC on Base Network</strong>
						<p>
							You can purchase USDC on exchanges like Coinbase or Binance, then withdraw to your
							wallet address on the Base network.
						</p>
					</li>
					<li>
						<strong>Bridge USDC to Base</strong>
						<p>
							If you have USDC on another network (Ethereum, Polygon, etc.), you can use a bridge
							like <a href="https://bridge.base.org" target="_blank" rel="noopener">Base Bridge</a> to
							transfer it to Base.
						</p>
					</li>
					<li>
						<strong>Send to Your Wallet Address</strong>
						<p>Copy your wallet address above and send USDC on the Base network to it.</p>
					</li>
				</ol>

				<div class="warning-box">
					<strong>Important:</strong> Only send USDC on the Base network to this address. Sending other
					tokens or using the wrong network may result in lost funds.
				</div>
			</div>

			<div class="actions">
				<a href="/" class="secondary-button">Back to Home</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 600px;
		margin: 2rem auto;
		padding: 1rem;
	}

	h1 {
		text-align: center;
		margin-bottom: 2rem;
	}

	.auth-section {
		text-align: center;
		margin: 2rem 0;
	}

	.wallet-section {
		background: #f9f9f9;
		padding: 1.5rem;
		border-radius: 12px;
	}

	.wallet-address {
		margin: 1rem 0;
	}

	.wallet-address .label-text {
		display: block;
		font-weight: bold;
		margin-bottom: 0.5rem;
	}

	.address-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.address-row code {
		flex: 1;
		padding: 0.75rem;
		background: #e5e5e5;
		border-radius: 4px;
		font-size: 0.75rem;
		word-break: break-all;
	}

	.balance-section {
		margin: 2rem 0;
		padding: 1rem;
		background: white;
		border-radius: 8px;
		text-align: center;
	}

	.balance {
		font-size: 2rem;
		font-weight: bold;
		color: #22c55e;
		margin: 1rem 0;
	}

	.instructions {
		margin: 2rem 0;
	}

	.instructions ol {
		padding-left: 1.5rem;
	}

	.instructions li {
		margin: 1rem 0;
	}

	.instructions p {
		margin-top: 0.5rem;
		color: #666;
	}

	.instructions a {
		color: #7c3aed;
	}

	.warning-box {
		margin-top: 1.5rem;
		padding: 1rem;
		background: #fef3c7;
		border: 1px solid #f59e0b;
		border-radius: 8px;
		color: #92400e;
	}

	.warning {
		color: #f59e0b;
	}

	.error {
		color: #ef4444;
	}

	.actions {
		margin-top: 2rem;
		text-align: center;
	}

	.primary-button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: bold;
		color: white;
		background-color: #7c3aed;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-decoration: none;
	}

	.secondary-button {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		color: #333;
		background-color: #e5e5e5;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-decoration: none;
		display: inline-block;
	}

	.copy-button {
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		color: white;
		background-color: #7c3aed;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
</style>

