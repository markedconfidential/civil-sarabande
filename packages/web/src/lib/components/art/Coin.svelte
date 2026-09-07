<script lang="ts">
	import PixelSprite from '$lib/components/design/PixelSprite.svelte';
	import { COIN } from '$lib/design/specimens';

	export let scale = 2;
	export let label = 'Coin';
	export let decorative = false;
</script>

<span class="coin"><PixelSprite bitmap={COIN} {scale} {label} {decorative} /></span>

<style>
	.coin {
		display: inline-block;
		line-height: 0;
	}
</style>
