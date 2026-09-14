<script lang="ts">
	import { gameModes } from "../gamemodes.ts";
	import { st } from "../state.svelte.ts";
	import type { GenData } from "../types.ts";
	import { loadImageData } from "../utils.ts";
	import StatusMessage from "./common/StatusMessage.svelte";

	let browserScreen: "list" | "create" = $state("list");
	let refreshTick = $state(0);
	let selectedMode: string | null = $state(null);
	let hideFull = $state(false);
	let searchQuery = $state("");

	const rooms = $derived.by(async () => {
		// these are dependencies - if they change, this function runs again
		refreshTick;
		st.room;

		const r = await fetch("/api/getRooms");
		return await r.json();
	});

	type RoomInfo = { n: string; m: string; pl: number; mxpl: number; lb: number };

	// the room the player is in is always shown, regardless of filters
	function matchesFilters(room: RoomInfo): boolean {
		if (st.room === room.n) return true;
		if (selectedMode && room.m !== selectedMode) return false;
		if (hideFull && room.pl >= room.mxpl) return false;
		if (searchQuery && !room.n.toLowerCase().includes(searchQuery.toLowerCase())) return false;
		return true;
	}

	// clicking a row only selects it; joining is a separate, deliberate click.
	// a single stray click in the list used to yank you straight out of your game.
	let pickedRoom: string | null = $state(null);

	function joinPicked() {
		if (pickedRoom && !st.changingLobby) window.joinRoom(pickedRoom);
	}

	let joinCode = $state("");
	let joinPassword = $state("");
	let joinMessage = $state("");

	async function tryJoinByCode() {
		if (st.changingLobby || st.room === joinCode) return;
		if (!joinCode) {
			joinMessage = "Please enter a room code.";
			return;
		}

		joinMessage = "Please wait...";
		const successfullyStartedJoin = await window.joinRoom(joinCode, joinPassword);

		if (!successfullyStartedJoin) {
			joinMessage = "No Room Found.";
		}
	}

	// reset the quick-join message on room switch
	$effect(() => {
		st.room;
		joinMessage = "";
	});

	const createGameOpts = $state({
		srvPlayers: 6,
		srvHealthMult: 1,
		srvSpeedMult: 1,
		srvPass: "",
		srvMap: null as (GenData & { name: string }) | null,
		srvModes: [] as number[],
	});

	async function startCreatedRoom() {
		st.messages.serverCreate = "Creating room...";
		const res = await fetch("/api/createRoom", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(createGameOpts),
		});
		if (!res.ok) {
			st.messages.serverCreate = "Failed to create room.";
			return;
		}
		const { room, hostSecret, mapRejected } = await res.json();
		st.hostSecret = hostSecret;
		st.isHost = true;
		st.messages.serverCreate = mapRejected
			? `Room code: ${room} (share this with friends) — custom map was invalid, using default`
			: `Room code: ${room} (share this with friends)`;
		window.joinRoom(room);
	}

	function closeCreatedRoom() {
		(window as any).closeServer?.();
	}
</script>

<div id="roomListHeader">
	<h3 class="menuHeader">{browserScreen === "list" ? "ROOM BROWSER" : "CREATE ROOM"}</h3>
	<div>
		{#if browserScreen === "list"}
			<button class="smallMenuButton" onclick={() => browserScreen = "create"}>CREATE ROOM</button>
			<button class="smallMenuButton" onclick={() => refreshTick++}>REFRESH</button>
		{:else}
			<button class="smallMenuButton" onclick={() => browserScreen = "list"}>BACK</button>
		{/if}
	</div>
</div>

<div style:display={browserScreen === "list" ? "block" : "none"}>
<div id="roomFilters">
	<div id="modeFilterRow">
		<button
			class="smallMenuButton modeFilterButton"
			class:modeFilterActive={selectedMode === null}
			onclick={() => selectedMode = null}
		>
			ALL
		</button>
		{#each gameModes as mode}
			<button
				class="smallMenuButton modeFilterButton"
				class:modeFilterActive={selectedMode === mode.code}
				title={mode.name}
				onclick={() => selectedMode = selectedMode === mode.code ? null : mode.code}
			>
				{mode.code.toUpperCase()}
			</button>
		{/each}
		<button
			class="smallMenuButton modeFilterButton"
			class:modeFilterActive={hideFull}
			onclick={() => hideFull = !hideFull}
		>
			HIDE FULL
		</button>
	</div>
	<input
		class="menuTextInput"
		id="roomSearchInput"
		placeholder="Search room code..."
		maxlength="10"
		bind:value={searchQuery}
	>
</div>
<div id="roomSelector" style:pointer-events={st.changingLobby ? "none" : "auto"}>
	<svelte:boundary>
		{#snippet pending()}
			Loading...
		{/snippet}
		{#each (await rooms).filter(matchesFilters) as room}
			{@const full = room.pl >= room.mxpl && st.room !== room.n}
			<div
				class="roomSelectItem"
				class:roomSelectItemSelected={st.room === room.n}
				class:roomSelectItemPicked={pickedRoom === room.n}
				class:roomSelectItemFull={full}
				onclick={() => { if (!full) pickedRoom = room.n }}
				ondblclick={() => { if (!full) { pickedRoom = room.n; joinPicked(); } }}
			>
				<b>{`${room.m}_${room.n}`}</b>
				<b>{full ? "FULL" : `${room.lb}% - ${room.pl}/${room.mxpl}`}</b>
			</div>
		{:else}
			<div id="noRoomsMessage">No rooms match the filters.</div>
		{/each}
	</svelte:boundary>
</div>
<div id="roomJoinBar">
	<span class="pickedLabel">
		{pickedRoom ? `Selected: ${pickedRoom}` : "Select a room above"}
	</span>
	<button
		class="smallMenuButton"
		disabled={!pickedRoom || st.changingLobby}
		onclick={joinPicked}
	>
		{st.changingLobby ? "JOINING..." : "JOIN ROOM"}
	</button>
</div>
<div id="quickJoin">
	<h3 class="menuHeader">JOIN A ROOM</h3>
	<input
		class="menuTextInput"
		id="quickJoinCode"
		placeholder="Room code"
		maxlength="50"
		bind:value={joinCode}
		onkeydown={(e) => { if (e.code === "Enter") tryJoinByCode() }}
	>
	<input
		class="menuTextInput"
		id="quickJoinPassword"
		type="password"
		placeholder="Password (optional)"
		maxlength="10"
		bind:value={joinPassword}
		onkeydown={(e) => { if (e.code === "Enter") tryJoinByCode() }}
	>
	<button class="smallMenuButton" onclick={tryJoinByCode}>JOIN</button>
	<StatusMessage text={joinMessage} />
</div>
<div id="currentRoomLine">
	<b>Current Room:</b>
	<span class="selectable">
		{#if st.room && !st.changingLobby}
			{st.room}
		{:else if st.changingLobby}
			Joining...
		{:else}
			None selected
		{/if}
	</span>
	{#if st.isHost}
		<span id="closeRoomLink" onclick={closeCreatedRoom}>Close Room</span>
	{/if}
</div>
</div>

<div style:display={browserScreen === "create" ? "block" : "none"}>
	<div id="createRoomContainer">
		<h1>Statistics will not be affected by games played in private rooms.</h1>
		<b>Gamemodes:</b>
		<div style="margin-top:5px;margin-bottom:5px;">
			{#each gameModes as gameMode, idx}
				<input type="checkbox" value={idx} bind:group={createGameOpts.srvModes}>
				{gameMode.name}
				<br>
			{/each}
		</div>
		<b>Room Size: (2-8 Players)</b>
		<input
			class="menuTextInput"
			placeholder="Number of Players"
			bind:value={createGameOpts.srvPlayers}
			min="2"
			max="8"
			step="2"
			maxlength="1"
			type="number"
			style="margin-top:5px;margin-bottom:8px;width:95%;"
		>
		<b>Health Multiplier:</b>
		<input
			class="menuTextInput"
			placeholder="Health Multiplier"
			bind:value={createGameOpts.srvHealthMult}
			min="0.1"
			max="3.0"
			step="0.1"
			maxlength="1"
			type="number"
			style="margin-top:5px;margin-bottom:8px;width:95%;"
		>
		<b>Speed Multiplier:</b>
		<input
			class="menuTextInput"
			placeholder="Speed Multiplier"
			bind:value={createGameOpts.srvSpeedMult}
			min="0.1"
			max="2.0"
			step="0.1"
			maxlength="1"
			type="number"
			style="margin-top:5px;margin-bottom:8px;width:95%;"
		>
		<b>Password: (Optional)</b>
		<input
			class="menuTextInput"
			placeholder="Room Password"
			bind:value={createGameOpts.srvPass}
			maxlength="10"
			type="password"
			style="margin-top:5px;margin-bottom:8px;width:95%;"
		>
		<b>Custom Map: (Optional)</b>
		<button type="button" class="smallMenuButton" onclick={() => document.getElementById('customMapFile')!.click()}>
			{createGameOpts.srvMap?.name ?? "Select Map"}
		</button>
		<input
			type="file"
			id="customMapFile"
			style="display:none;"
			accept="image/*"
			onchange={async (event) => {
			    const file = event.currentTarget?.files?.[0];
        		if (!file) return;
        		const name = event.currentTarget.value.split("\\").at(-1)!;
        		createGameOpts.srvMap = { name, ...(await loadImageData(file)) };
			}}
		>
		<div style="margin-bottom:8px;"><StatusMessage text={st.messages.serverCreate} /></div>
		<button type="button" class="smallMenuButton" onclick={startCreatedRoom}>START</button>
	</div>
</div>

<style>
	#roomListHeader {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		font-size: 12px;
	}
	.menuHeader {
		margin-top: 0px;
		margin-bottom: 10px;
	}

	#roomFilters {
		width: 100%;
		box-sizing: border-box;
		margin-bottom: 6px;
	}
	#modeFilterRow {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-bottom: 6px;
	}
	.modeFilterButton {
		font-size: 10px;
		padding: 4px 6px;
	}
	.modeFilterActive {
		background: var(--setting-active-blue);
		box-shadow: none;
		top: 1px;
	}
	#roomSearchInput {
		width: 100%;
		box-sizing: border-box;
	}
	#noRoomsMessage {
		font-size: 12px;
		padding: 5px;
		opacity: 0.6;
	}

	#roomSelector {
		max-height: 220px;
		overflow-y: scroll;
		overflow-x: hidden;
	}

	.roomSelectItem {
		font-size: 12px;
		padding: 5px;
		cursor: pointer;
		position: relative;
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
	}
	.roomSelectItem:hover,
	.roomSelectItemSelected {
		background: rgba(0, 0, 0, 0.1);
		font-size: 14px;
	}
	.roomSelectItemPicked {
		background: rgba(118, 179, 227, 0.35);
		outline: 1px solid var(--setting-active-blue, #76b3e3);
	}
	#roomJoinBar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 8px;
	}
	.pickedLabel {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	#roomJoinBar button[disabled] {
		opacity: 0.45;
		cursor: default;
	}
	.roomSelectItemFull {
		opacity: 0.5;
		cursor: not-allowed;
	}

	#quickJoin {
		margin-top: 10px;
		width: 100%;
		box-sizing: border-box;
	}
	#quickJoin .menuHeader {
		margin-bottom: 6px;
	}
	#quickJoinCode,
	#quickJoinPassword {
		width: 100%;
		box-sizing: border-box;
		margin-bottom: 6px;
	}

	#currentRoomLine {
		margin-top: 10px;
		font-size: 12px;
	}
	#closeRoomLink {
		cursor: pointer;
		color: #e37676;
		margin-left: 5px;
	}
	#closeRoomLink:hover {
		text-decoration: underline;
	}
	.selectable {
		-webkit-user-select: text;
		user-select: text;
		pointer-events: all;
	}

	#createRoomContainer {
		max-height: 380px;
		overflow-y: scroll;
		overflow-x: hidden;
		font-size: 12px;
	}
	#createRoomContainer h1 {
		font-size: 12px;
		font-weight: normal;
		opacity: 0.7;
		margin-top: 0;
	}
</style>
