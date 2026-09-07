<script lang="ts">
	import { muted, play, toggleMuted, unlockAudio } from '$lib/audio';

	function onClick() {
		unlockAudio();
		toggleMuted();
		if (!$muted) play('tick');
	}
</script>

<button
	type="button"
	class="mute-toggle"
	on:click={onClick}
	aria-pressed={$muted}
	aria-label={$muted ? 'Unmute sound' : 'Mute sound'}
	title={$muted ? 'Sound off' : 'Sound on'}
>
	<svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true" shape-rendering="crispEdges">
		<path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
		{#if $muted}
			<path d="M10 6l4 4M14 6l-4 4" stroke="currentColor" stroke-width="1.5" />
		{:else}
			<path d="M11 5c1.5 1.5 1.5 4.5 0 6M13 3c2.5 2.5 2.5 7.5 0 10" fill="none" stroke="currentColor" stroke-width="1.5" />
		{/if}
	</svg>
</button>

<style>
	.mute-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		min-height: 0;
		padding: 0;
		border: 2px solid #0d0a0e;
		box-shadow:
			0 0 0 1px #9a7d1c,
			2px 2px 0 1px #0d0a0e;
		background: #2a2230;
		color: #e6bb3a;
		border-radius: 0;
	}

	.mute-toggle[aria-pressed='true'] {
		color: #6a6269;
	}

	.mute-toggle:hover {
		background: #4a3f52;
	}
</style>
