<script lang="ts">
	import type { sprays } from "../../sprays.ts";

	interface Props {
		spray: (typeof sprays)[number];
	}

	const props: Props = $props();
</script>

<div class="hoverTooltip">
	<img class="sprayDisplayImage" src={`../assets/sprays/${props.spray.id}.png`}>
</div>
<style>
	.hoverTooltip {
		width: 90px;
		height: 90px;
	}
</style>
