<script lang="ts">
	import { st } from "../state.svelte.ts";

	$effect(() => {
		localStorage.setItem("settings", JSON.stringify(st.settings));
	});
</script>

<!-- could be better organized, but this is a start -->
<h2>GRAPHICS:</h2>
<label>
	<input bind:checked={st.settings.showParticles} type="checkbox">
	Particles
</label>
<br>
<label>
	<input bind:checked={st.settings.showBTrails} type="checkbox">
	Bullet Trails
</label>
<br>
<label>
	<input bind:checked={st.settings.showGlows} type="checkbox">
	Bloom
</label>
<br>
<label>
	<input bind:checked={st.settings.showShadows} type="checkbox">
	Shaders
</label>
<br>
<label>
	<input bind:checked={st.settings.showNames} type="checkbox">
	Names
</label>
<h2>OTHER:</h2>
<label>
	<input bind:checked={st.settings.showUI} type="checkbox">
	Show UI
</label>
<label>
	<input bind:checked={st.settings.showChat} type="checkbox">
	Chat
</label>
<br>
<label>
	<input bind:checked={st.settings.selectChat} type="checkbox">
	Chat Selection
</label>
<br>
<label>
	<input bind:checked={st.settings.showPINGFPS} type="checkbox">
	Ping &amp; FPS Counter
</label>
<br>
<label>
	<input bind:checked={st.settings.showLeader} type="checkbox">
	Leaderboard
</label>
<br>
<label>
	<input bind:checked={st.settings.showFade} type="checkbox">
	UI Fade Effects
</label>
<br>
<label>
	<input bind:checked={st.settings.showSprays} type="checkbox">
	Sprays
</label>
<h2>SECRET:</h2>
<label>
	<input bind:checked={st.settings.showTrippy} type="checkbox">
	Migraine
</label>

<style>
	h2 {
		font-size: 14px;
		color: rgba(0, 0, 0, 0.6);
		margin-bottom: 5px;
	}
	* {
		color: rgba(0, 0, 0, 0.5);
	}
</style>
