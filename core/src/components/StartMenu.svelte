<script lang="ts">
	import { st } from "../state.svelte";

	// ENTER GAME is available even with no room picked: startGame autojoins the
	// best available room in that case. only block while a join is in flight.
	const canStartGame = $derived(!st.changingLobby);
</script>
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
<button type="button" id="startButton" onclick={() => { if (canStartGame) window.startGame() }}>
	{st.changingLobby ? "JOINING..." : "ENTER GAME"}
</button>
{#if !st.room && !st.changingLobby}
	<div id="noRoomHint">Pick a room from the Room Browser, or press Enter Game to auto-join.</div>
{/if}

<div id="currentRoomRow">
	<span class="roomLabel">
		<b>Room:</b>
		{#if st.changingLobby}
			Joining...
		{:else}
			{st.room ?? "None selected"}
		{/if}
	</span>
	<button type="button" class="smallMenuButton" onclick={() => st.menuModal = "rooms"}>BROWSE ROOMS</button>
</div>

<button type="button" id="leaderButton" onclick={() => window.open("/leaderboards.html", "_blank")}>
	LEADERBOARDS
</button>

<div id="menuButtonRow">
	<button type="button" class="menuRowButton" onclick={() => st.menuModal = "settings"}>SETTINGS</button>
	<button type="button" class="menuRowButton" onclick={() => st.menuModal = "controls"}>CONTROLS</button>
	<button type="button" class="menuRowButton" onclick={() => st.menuModal = "mods"}>MODS</button>
</div>

<style>
	#playerNameInput {
		width: 100%;
		text-align: center;
		padding: 12px;
		border: solid 1px #dcdcdc;
		transition:
			box-shadow 0.3s,
			border 0.3s;
		box-sizing: border-box;
		border-radius: 1px;
		font-size: 15px;
		margin-bottom: 12px;
		outline: none;
	}
	#playerNameInput:focus {
		border: solid 1px #cccccc;
		box-shadow: 0 0 3px 1px #dddddd;
	}
	#startButton {
		cursor: pointer;
		position: relative;
		width: 100%;
		height: 56px;
		box-sizing: border-box;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		background: #76b3e3;
		border: 0;
		box-shadow: inset 0 -4px #6fa9d6;
		border-radius: 1px;
		margin-bottom: 10px;
		font-size: 20px;
		color: #fff;
	}
	#startButton:active,
	#startButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
	}
	#noRoomHint {
		font-size: 11px;
		opacity: 0.6;
		text-align: center;
		margin-top: -4px;
		margin-bottom: 10px;
	}

	#currentRoomRow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		background: #f2f2f2;
		padding: 8px 10px;
		margin-bottom: 14px;
	}
	.roomLabel {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	#currentRoomRow .smallMenuButton {
		flex: none;
	}

	#leaderButton {
		cursor: pointer;
		position: relative;
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
		color: #fff;
	}
	#leaderButton:active,
	#leaderButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
	}

	#menuButtonRow {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}
	.menuRowButton {
		flex: 1;
		cursor: pointer;
		position: relative;
		box-sizing: border-box;
		text-align: center;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
		background: #76b3e3;
		border: 0;
		padding: 10px 6px;
		box-shadow: inset 0 -3px #6fa9d6;
		border-radius: 1px;
		font-size: 12px;
		color: #fff;
	}
	.menuRowButton:active,
	.menuRowButton:hover {
		top: 1px;
		background: #6fa9d6;
		outline: none;
		box-shadow: none;
	}
</style>
