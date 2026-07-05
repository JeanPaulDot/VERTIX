<script lang="ts">
	import { st } from "../state.svelte.ts";

	let canvas: HTMLCanvasElement;

	$effect(() => {
		// re-render whenever any part of the visible loadout changes
		st.loadout.class;
		st.loadout.primaryCamo;
		st.loadout.hat;
		st.loadout.shirt;

		if (!canvas) return;
		// sprites and hat/shirt/camo images load lazily (drawSprite skips
		// images that aren't ready), so redraw a few times to catch them
		window.renderLoadoutPreview?.(canvas);
		const timeouts = [200, 600, 1500].map((ms) =>
			setTimeout(() => window.renderLoadoutPreview?.(canvas), ms),
		);
		return () => timeouts.forEach(clearTimeout);
	});
</script>

<div id="loadoutPreview">
	<canvas bind:this={canvas} width="300" height="255"></canvas>
</div>

<style>
	#loadoutPreview {
		width: 100%;
		box-sizing: border-box;
		text-align: center;
	}
	canvas {
		width: 100%;
		image-rendering: pixelated;
	}
</style>
