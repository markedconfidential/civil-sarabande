<script lang="ts">
	/**
	 * Deterministic player emblem: 32 × 32 sprite from a player id or wallet.
	 */
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { sigilBitmap } from '$lib/art/sigil';

	export let seed: string;
	export let size: 32 | 64 = 64;
	export let label = 'Player sigil';

	$: bitmap = sigilBitmap(seed || 'anonymous');
	$: scale = size === 64 ? 2 : 1;
</script>

<span class="player-sigil" style="width:{size}px;height:{size}px">
	<PixelSprite {bitmap} {scale} {label} />
</span>

<style>
	.player-sigil {
		display: inline-block;
		line-height: 0;
		flex-shrink: 0;
		box-shadow: 2px 2px 0 #0d0a0e;
	}
</style>
