<script lang="ts">
	let textureModInput: HTMLInputElement;
</script>

<h3 class="menuHeaderTabbed2">LOAD MOD PACK</h3>
<div id="featuredModList">
	<!--
        <div class="modBtn" onclick="loadModPack('/mods/minecraft/vertixmod.zip', false)"> Minecraft Mod Pack (6 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/pacman/vertixmod.zip', false)"> Pacman Mod Pack (1 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/ruins/vertixmod.zip', false)"> Undertale Ruins (4 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/snowdin/vertixmod.zip', false)"> Undertale Snowdin (3 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/waterfalls/vertixmod.zip', false)"> Undertale Waterfalls (1 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/grayscale/vertixmod.zip', false)"> Black &amp; White Mod (4 mb)</div>
        <div class="modBtn" onclick="loadModPack('/mods/water/vertixmod.zip', false)"> Waterguns</div>
        <div class="modBtn" onclick="loadModPack('mods/mario/vertixmod.zip', false)"> Mario Mod Pack (5 mb)</div>
        <div class="modBtn" onclick="loadModPack('mods/nuclear-throne/vertixmod.zip', false)">Nuclear Throne</div>
    -->
	<div class="modBtn" onclick={() => window.loadModPack('13xlc5n3ipudqsn', false)}>Sonic Mod Pack</div>
</div>
<div>
	<input
		type="text"
		tabindex="0"
		autofocus
		placeholder="Mod Key/URL"
		id="textureModInput"
		bind:this={textureModInput}
		class="menuTextInput"
	>
	<button
		type="button"
		id="texturePackButton"
		class="smallMenuButton"
		onclick={() => window.loadModPack(textureModInput.value, false)}
	>
		LOAD
	</button>
</div>
<b>
	<a
		target="_blank"
		href="https://www.reddit.com/r/VertixOnline/comments/4vypx9/texture_mods_please_post_all_texture_mods_here/"
	>
		Get more mods here
	</a>
</b>
<br>
<div id="modInfo"></div>

<style>
	#featuredModList {
		margin-top: 7px;
		overflow-y: scroll;
		max-height: 102px;
		margin-bottom: 10px;
		cursor: pointer;
	}

	.modBtn {
		padding: 2px;
	}
	.modBtn:hover {
		background: rgba(0, 0, 0, 0.1);
		font-size: 14px;
	}

	#textureModInput {
		width: 70%;
	}
	#textureModInput:focus {
		border: solid 1px #cccccc;
		box-shadow: 0 0 3px 1px #dddddd;
	}

	#texturePackButton {
		margin-left: 5px;
		width: 25%;
	}
	#texturePackButton:active,
	#texturePackButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
	}

	#modInfo {
		margin-top: 5px;
		max-height: 100px !important;
		max-width: 300px !important;
	}
</style>
