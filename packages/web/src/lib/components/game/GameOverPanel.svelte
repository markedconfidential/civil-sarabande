<script lang="ts">
	/**
	 * Game-over tableau: both sigils, the verdict in the display face, the
	 * final coin stacks, and the settlement seal.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { unitsToUsdc, type GameStateView } from '@civil-sarabande/shared';
	import { panelIn, popIn } from '$lib/motion';
	import { play } from '$lib/audio';
	import PlayerSigil from '$lib/components/art/PlayerSigil.svelte';
	import CoinStack from '$lib/components/art/CoinStack.svelte';
	import Seal from './Seal.svelte';

	export let game: GameStateView;
	/** Block explorer base URL without a trailing slash, or null */
	export let explorerUrl: string | null = null;

	$: isPlayer1 = game.yourRole === 'player1';
	$: you = isPlayer1 ? game.player1 : game.player2;
	$: them = isPlayer1 ? game.player2 : game.player1;
	$: yourSeed = you?.address || you?.id || 'you';
	$: theirSeed = them?.address || them?.id || 'them';
	$: yourName = you?.name || 'You';
	$: theirName = them?.name || 'Opponent';

	$: verdict =
		game.yourCoins > game.theirCoins ? 'you' : game.theirCoins > game.yourCoins ? 'them' : 'tie';

	type SealState = 'pending' | 'stamping' | 'sealed' | 'released' | 'failed';
	interface SealView {
		state: SealState;
		label: string;
		detail: string;
		href: string | null;
	}

	function toUsdc(units: string | null): string {
		if (!units) return '0';
		try {
			return unitsToUsdc(BigInt(units));
		} catch {
			return units;
		}
	}

	$: seal = ((): SealView => {
		const e = game.escrow;
		switch (e.status) {
			case 'settling':
				return { state: 'stamping', label: 'Settling on chain', detail: 'Waiting for confirmation', href: null };
			case 'settled':
				return {
					state: 'released',
					label: 'Settled',
					detail: `You receive ${toUsdc(e.yourPayout)} USDC · They receive ${toUsdc(e.theirPayout)} USDC`,
					href: explorerUrl && e.payoutTxHash ? `${explorerUrl}/tx/${e.payoutTxHash}` : null
				};
			case 'failed':
				return {
					state: 'failed',
					label: 'Settlement failed',
					detail: e.error || 'The settlement transaction reverted; it will be retried.',
					href: explorerUrl && e.payoutTxHash ? `${explorerUrl}/tx/${e.payoutTxHash}` : null
				};
			case 'cancelled':
				return { state: 'sealed', label: 'Refunded', detail: 'Stakes returned before play began', href: null };
			case 'active':
			default:
				return { state: 'pending', label: 'Awaiting settlement', detail: 'The escrow will pay out shortly', href: null };
		}
	})();

	let sealPlayed = false;
	function maybeSealSound(state: SealState) {
		if (state === 'released' && !sealPlayed) {
			sealPlayed = true;
			play('seal');
		}
	}
	$: maybeSealSound(seal.state);

	onMount(() => {
		if (verdict === 'you') play('win');
		else if (verdict === 'them') play('lose');
		// Switch the page wash to the settlement vault while the tableau shows
		document.body.dataset.scene = 'settlement';
	});

	onDestroy(() => {
		if (typeof document !== 'undefined' && document.body.dataset.scene === 'settlement') {
			delete document.body.dataset.scene;
		}
	});
</script>

<h2>Game Over</h2>

<div class="tableau">
	<div class="duelists">
		<div class="duelist duelist--you" in:popIn={{ delay: 100 }}>
			<PlayerSigil seed={yourSeed} size={64} label="Your sigil" />
			<span class="duelist-name">{yourName}</span>
			<CoinStack count={game.yourCoins} label="final coins" />
		</div>

		<div class="verdict verdict--{verdict}" in:popIn={{ delay: 400, duration: 360 }}>
			{#if verdict === 'you'}
				<span class="verdict-word">Victory</span>
				<span class="verdict-sub">You won the game</span>
			{:else if verdict === 'them'}
				<span class="verdict-word">Defeat</span>
				<span class="verdict-sub">Opponent won</span>
			{:else}
				<span class="verdict-word">Stalemate</span>
				<span class="verdict-sub">The game ended in a tie</span>
			{/if}
		</div>

		<div class="duelist duelist--them" in:popIn={{ delay: 250 }}>
			<PlayerSigil seed={theirSeed} size={64} label="Opponent's sigil" />
			<span class="duelist-name">{theirName}</span>
			<CoinStack count={game.theirCoins} label="final coins" />
		</div>
	</div>

	<div class="settlement" in:panelIn={{ delay: 700 }}>
		{#key seal.state}
			<Seal state={seal.state} label={seal.label} detail={seal.detail} href={seal.href} />
		{/key}
	</div>
</div>

<div class="play-again" in:panelIn={{ delay: 900 }}>
	<a href="/" class="btn-gold btn-lg">Play Again</a>
</div>

<style>
	.tableau {
		text-align: center;
		margin-bottom: var(--space-xl);
	}

	.duelists {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-lg);
		margin-bottom: var(--space-xl);
	}

	.duelist {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	.duelist-name {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 0.95rem;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.duelist--you .duelist-name {
		color: var(--color-primary);
	}

	.duelist--them .duelist-name {
		color: var(--color-gold-dim);
	}

	.verdict {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-md) var(--space-lg);
	}

	.verdict-word {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 2.2rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		line-height: 1;
		text-shadow: 2px 2px 0 rgba(13, 10, 14, 0.25);
	}

	.verdict--you .verdict-word {
		color: var(--color-success);
	}

	.verdict--them .verdict-word {
		color: var(--color-error);
	}

	.verdict--tie .verdict-word {
		color: var(--color-text-dim);
	}

	.verdict-sub {
		font-style: italic;
		color: var(--color-text-dim);
		margin-top: var(--space-xs);
	}

	.settlement {
		display: flex;
		justify-content: center;
	}

	.settlement :global(.seal) {
		border: 2px solid #0d0a0e;
		box-shadow: 0 0 0 1px #4a3f52;
		background: #1a1520;
		color: #e8e4eb;
		text-align: left;
		max-width: 100%;
	}

	.settlement :global(.seal .seal-detail) {
		color: #9a9498;
	}

	.play-again {
		text-align: center;
	}

	@media (max-width: 600px) {
		.duelists {
			grid-template-columns: 1fr 1fr;
			gap: var(--space-md);
		}

		.verdict {
			grid-column: 1 / -1;
			order: -1;
			padding: var(--space-sm);
		}

		.verdict-word {
			font-size: 1.6rem;
		}
	}
</style>
