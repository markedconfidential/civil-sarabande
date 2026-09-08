<script lang="ts">
	/**
	 * A framed JRPG window: double pixel border with corner studs over a
	 * painted interior. The frame itself is the global `.jrpg-window` class
	 * in app.css, shared with `.card` and `.action-panel`, so this wrapper is
	 * for ad-hoc windows (dialogs, tooltips, specimen pages).
	 */
	export let variant: 'parchment' | 'ink' | 'blood' = 'parchment';
	export let title = '';
	export let as: 'div' | 'section' | 'aside' = 'div';
</script>

<svelte:element this={as} class="jrpg-window jrpg-window--{variant} {$$props.class ?? ''}">
	{#if title}
		<div class="jrpg-title">{title}</div>
	{/if}
	<slot />
</svelte:element>
