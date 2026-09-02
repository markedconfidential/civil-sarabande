<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, isLoading, onboardingStatus } from '$lib/auth';
	import { login } from '$lib/privy';

	let username = '';
	let error: string | null = null;
	let checking = false;
	let saving = false;
	let isAvailable: boolean | null = null;

	// Check if we're authenticated and need username
	onMount(() => {
		// Wait for auth to load
		const unsubscribe = isLoading.subscribe((loading) => {
			if (!loading) {
				const auth = $isAuthenticated;
				if (!auth) {
					// Not authenticated, will show login prompt
					return;
				}

				// Check if user already has a username
				checkCurrentUser();
			}
		});

		return unsubscribe;
	});

	async function checkCurrentUser() {
		try {
			const { getAccessToken } = await import('$lib/privy');
			const token = await getAccessToken();

			if (!token) {
				error = 'Failed to get access token';
				return;
			}

			const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
			const response = await fetch(`${API_URL}/users/me`, {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!response.ok) {
				error = 'Failed to load user data';
				return;
			}

			const data = await response.json();

			if (data.user.username) {
				// Already has username, redirect to home
				onboardingStatus.set({
					needsUsername: false,
					username: data.user.username,
					isLoading: false
				});
				goto('/');
			} else {
				onboardingStatus.set({
					needsUsername: true,
					username: null,
					isLoading: false
				});
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to check user';
		}
	}

	async function checkUsername() {
		if (username.length < 3) {
			isAvailable = null;
			return;
		}

		checking = true;
		error = null;

		try {
			const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
			const response = await fetch(`${API_URL}/users/username/${encodeURIComponent(username)}`);

			if (!response.ok) {
				error = 'Failed to check username';
				checking = false;
				return;
			}

			const data = await response.json();
			isAvailable = data.available;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to check username';
		}

		checking = false;
	}

	async function handleSubmit() {
		if (!username.trim() || !isAvailable) {
			return;
		}

		saving = true;
		error = null;

		try {
			const { getAccessToken } = await import('$lib/privy');
			const token = await getAccessToken();

			if (!token) {
				error = 'Failed to get access token';
				saving = false;
				return;
			}

			const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
			const response = await fetch(`${API_URL}/users/username`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ username: username.trim() })
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error || 'Failed to set username';
				saving = false;
				return;
			}

			const data = await response.json();

			onboardingStatus.set({
				needsUsername: false,
				username: data.user.username,
				isLoading: false
			});

			// Redirect to home
			goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to set username';
			saving = false;
		}
	}

	// Debounced username check
	let debounceTimer: ReturnType<typeof setTimeout>;
	function handleUsernameInput() {
		clearTimeout(debounceTimer);
		isAvailable = null;
		debounceTimer = setTimeout(checkUsername, 300);
	}
</script>

<svelte:head>
	<title>Create Your Account - Civil Sarabande</title>
</svelte:head>

<div class="container container--narrow">
	<header class="page-header">
		<h1>Civil Sarabande</h1>
		<p class="page-subtitle">Take a name before you take a seat</p>
	</header>

	{#if $isLoading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading...</p>
		</div>
	{:else if !$isAuthenticated}
		<div class="card auth-card">
			<h2>Welcome</h2>
			<p>Sign in to create your account and start playing.</p>
			<button type="button" on:click={login} class="btn-gold btn-lg btn-block">
				Sign In with Email or Phone
			</button>
		</div>
	{:else}
		<div class="card">
			<h2>Choose Your Username</h2>
			<p class="card-intro">This will be visible to other players.</p>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="form-group">
					<label for="username">Username</label>
					<input
						type="text"
						id="username"
						bind:value={username}
						on:input={handleUsernameInput}
						placeholder="Enter username"
						minlength="3"
						maxlength="20"
						pattern="[a-zA-Z0-9_]+"
						disabled={saving}
						required
					/>

					{#if checking}
						<span class="field-status field-status--pending">Checking...</span>
					{:else if isAvailable === true}
						<span class="field-status field-status--ok">Available</span>
					{:else if isAvailable === false}
						<span class="field-status field-status--error">Username taken</span>
					{/if}

					<p class="field-hint">3-20 characters, letters, numbers, and underscores only</p>
				</div>

				{#if error}
					<div class="alert alert--error">{error}</div>
				{/if}

				<button
					type="submit"
					class="btn-primary btn-lg btn-block"
					disabled={saving || !isAvailable || username.length < 3}
				>
					{saving ? 'Creating Account...' : 'Create Account'}
				</button>
			</form>
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
</style>
