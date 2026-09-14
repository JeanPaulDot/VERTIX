<script lang="ts">
	import { st } from "../state.svelte.ts";
	import { applyVolumeSettings } from "../sound.ts";

	$effect(() => {
		localStorage.setItem("settings", JSON.stringify(st.settings));
	});

	// push audio changes into howler as the sliders move
	$effect(() => {
		st.settings.muted;
		st.settings.masterVolume;
		st.settings.musicVolume;
		st.settings.sfxVolume;
		applyVolumeSettings();
	});

	const pct = (v: number) => `${Math.round(v * 100)}%`;
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
<h2>AUDIO:</h2>
<label>
	<input bind:checked={st.settings.muted} type="checkbox">
	Mute All
</label>
<div class="volumeRow">
	<span>Master</span>
	<input type="range" min="0" max="1" step="0.05" bind:value={st.settings.masterVolume} disabled={st.settings.muted}>
	<span class="volumeValue">{pct(st.settings.masterVolume)}</span>
</div>
<div class="volumeRow">
	<span>Music</span>
	<input type="range" min="0" max="1" step="0.05" bind:value={st.settings.musicVolume} disabled={st.settings.muted}>
	<span class="volumeValue">{pct(st.settings.musicVolume)}</span>
</div>
<div class="volumeRow">
	<span>Effects</span>
	<input type="range" min="0" max="1" step="0.05" bind:value={st.settings.sfxVolume} disabled={st.settings.muted}>
	<span class="volumeValue">{pct(st.settings.sfxVolume)}</span>
</div>

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
	.volumeRow {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 4px 0;
		font-size: 13px;
	}
	.volumeRow > span:first-child {
		flex: 0 0 60px;
	}
	.volumeRow input[type="range"] {
		flex: 1;
		min-width: 0;
	}
	.volumeValue {
		flex: 0 0 38px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
