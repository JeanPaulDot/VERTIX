<script lang="ts">
	let textureModInput: HTMLInputElement;
</script>

<h3 class="menuHeaderTabbed2">LOAD MOD PACK</h3>
<div id="featuredModList">
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Sonic%20Mod%20Primary/vertixmod.zip', false)}>Sonic Mod Primary</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Sonic%20Mod%20Secondary/vertixmod.zip', false)}>Sonic Mod Secondary</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Half%20Life%202%20Mod/vertixmod.zip', false)}>Half Life 2 Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Nuclear%20Throne%20Mod/vertixmod.zip', false)}>Nuclear Throne Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/D34D5H0T%20Overhaul%20Normal/vertixmod.zip', false)}>D34D5H0T Overhaul Normal</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/DefaultSimon_s/vertixmod.zip', false)}>DefaultSimon's</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Just%20A%20Fun%20Mod/vertixmod.zip', false)}>Just A Fun Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/BlookyTraps%20Meme%20Hell/vertixmod.zip', false)}>BlookyTraps Meme Hell</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Vertigo%20Mod/vertixmod.zip', false)}>Vertigo Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Waterguns%20Returns/vertixmod.zip', false)}>Waterguns Returns</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Sound%20Pack%20(For%20Starters)%20Mod/vertixmod.zip', false)}>Sound Pack (For Starters)</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Sound%20Mod/vertixmod.zip', false)}>Sound Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/CSGO%20Full%20Sound%20Pack/vertixmod.zip', false)}>CSGO Full Sound Pack</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Sounds%20and%20Dark%20Walls%20Compressed/vertixmod.zip', false)}>Sounds and Dark Walls</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Aether_s%20Aecension%202.0/vertixmod.zip', false)}>Aether's Ascension 2.0</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Polish%20Minecraft%20Mod/vertixmod.zip', false)}>Polish Minecraft Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Scout%20Mod/vertixmod.zip', false)}>Scout Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Red%20Mod/vertixmod.zip', false)}>Red Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Ice%20Mod/vertixmod.zip', false)}>Ice Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Minimalism%20Mod/vertixmod.zip', false)}>Minimalism Mod</div>
	<div class="modBtn" onclick={() => window.loadModPack('/mods/Private%20Twinkletoes%20Red%20Soldier/vertixmod.zip', false)}>Private Twinkletoes Red Soldier</div>
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
		max-height: 300px;
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
