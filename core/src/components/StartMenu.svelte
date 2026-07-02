<script lang="ts">
	import { st } from "../state.svelte";
	import Controls from "./Controls.svelte";
	import Settings from "./Settings.svelte";

	const canStartGame = $derived(st.room && !st.changingLobby);

	let accordionState: "settings" | "controls" | null = $state(null);
	function accordionClick(elem: Exclude<typeof accordionState, null>) {
		if (elem === accordionState) {
			accordionState = null;
		} else {
			accordionState = elem;
		}
	}
</script>
<p class="menuHeader">MAIN MENU</p>
<input
	type="text"
	tabindex="0"
	autofocus
	placeholder="Player Name"
	id="playerNameInput"
	maxlength="15"
	bind:value={st.playerName}
	onkeydown={(e) => {if (e.code === "Enter" && canStartGame) window.startGame()}}
>
<br>
<button type="button" id="startButton" onclick={() => { if (canStartGame) window.startGame() }}>ENTER GAME</button>

<button type="button" id="leaderButton" onclick={() => window.open("/leaderboards.html", "_blank")}>
	LEADERBOARDS
</button>

<button type="button" id="settingsButton" onclick={() => accordionClick("settings")}>SETTINGS</button>
<div id="settings" style={`max-height: ${accordionState === "settings" ? "200" : "0"}px`}><Settings /></div>

<button type="button" id="instructionButton" onclick={() => accordionClick("controls")}>CONTROLS</button>
<br>
<div id="controls" style={`max-height: ${accordionState === "controls" ? "200" : "0"}px`}><Controls /></div>

<div id="socialContainer">
	<div style="margin-bottom:10px;">Thanks for playing</div>
</div>

<style>
	.menuHeader {
		margin-top: 0px;
		margin-bottom: 10px;
	}
	#playerNameInput {
		width: 100%;
		text-align: center;
		padding: 10px;
		border: solid 1px #dcdcdc;
		transition:
			box-shadow 0.3s,
			border 0.3s;
		box-sizing: border-box;
		border-radius: 1px;
		font-size: 14px;
		margin-bottom: 10px;
		outline: none;
	}
	#playerNameInput:focus {
		border: solid 1px #cccccc;
		box-shadow: 0 0 3px 1px #dddddd;
	}
	#startButton,
	#leaderButton {
		cursor: pointer;
		position: relative;
		margin: auto;
		margin-top: 10px;
		width: 100%;
		height: 41px;
		box-sizing: border-box;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		background: #76b3e3;
		border: 0;
		box-shadow: inset 0 -3px #6fa9d6;
		border-radius: 1px;
		margin-bottom: 10px;
		font-size: 15px;
		color: rgba(255, 255, 255, 1);
	}

	#leaderButton:active,
	#leaderButton:hover,
	#startButton:active,
	#startButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
		font-size: 17px;
	}
	#instructionButton {
		cursor: pointer;
		position: relative;
		margin: auto;
		margin-top: 10px;
		width: 100%;
		height: 41px;
		box-sizing: border-box;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		background: #76b3e3;
		border: 0;
		box-shadow: inset 0 -3px #6fa9d6;
		border-radius: 1px;
		margin-bottom: 10px;
		font-size: 15px;
		color: rgba(255, 255, 255, 1);
	}

	#instructionButton:active,
	#instructionButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
		font-size: 17px;
	}
	#settings {
		max-height: 0;
		overflow-y: scroll;
	}
	#controls {
		transition: max-height 0.2s;
		overflow-y: scroll;
		line-height: 200%;
		margin-bottom: 10px;
		max-height: 0;
	}
	#socialContainer {
		width: 100%;
		margin-bottom: 5px;
		display: inline-block;
	}
</style>
