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

<div class="onboarding-container">
	<h1>Welcome to Civil Sarabande</h1>

	{#if $isLoading}
		<p>Loading...</p>
	{:else if !$isAuthenticated}
		<div class="login-section">
			<p>Sign in to create your account and start playing.</p>
			<button type="button" on:click={login} class="primary-button"> Sign In with Email or Phone </button>
		</div>
	{:else}
		<div class="username-section">
			<h2>Choose Your Username</h2>
			<p>This will be visible to other players.</p>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="input-group">
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
						<span class="status checking">Checking...</span>
					{:else if isAvailable === true}
						<span class="status available">Available!</span>
					{:else if isAvailable === false}
						<span class="status taken">Username taken</span>
					{/if}
				</div>

				<p class="hint">3-20 characters, letters, numbers, and underscores only</p>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button
					type="submit"
					class="primary-button"
					disabled={saving || !isAvailable || username.length < 3}
				>
					{saving ? 'Creating Account...' : 'Create Account'}
				</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.onboarding-container {
		max-width: 400px;
		margin: 2rem auto;
		padding: 2rem;
		text-align: center;
	}

	h1 {
		margin-bottom: 1.5rem;
	}

	h2 {
		margin-bottom: 0.5rem;
	}

	.login-section,
	.username-section {
		margin-top: 2rem;
	}

	.input-group {
		margin: 1rem 0;
		text-align: left;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: bold;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: #7c3aed;
	}

	.status {
		display: block;
		margin-top: 0.5rem;
		font-size: 0.875rem;
	}

	.status.checking {
		color: #666;
	}

	.status.available {
		color: #22c55e;
	}

	.status.taken {
		color: #ef4444;
	}

	.hint {
		font-size: 0.875rem;
		color: #666;
		text-align: left;
	}

	.error {
		color: #ef4444;
		margin: 1rem 0;
	}

	.primary-button {
		width: 100%;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: bold;
		color: white;
		background-color: #7c3aed;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		margin-top: 1rem;
	}

	.primary-button:hover:not(:disabled) {
		background-color: #6d28d9;
	}

	.primary-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

