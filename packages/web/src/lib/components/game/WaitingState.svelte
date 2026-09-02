<script lang="ts">
	export let message: string;
</script>

<div class="waiting-state">
	<h2>{message}</h2>
	<div class="waiting-dots">
		<span></span><span></span><span></span>
	</div>
	<slot />
</div>
