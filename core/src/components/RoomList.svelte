<script lang="ts">
	import { st } from "../state.svelte.ts";

	let refreshTick = $state(0);

	const rooms = $derived.by(async () => {
		// these are dependencies - if they change, this function runs again
		refreshTick;
		st.room;

		const r = await fetch("/api/getRooms");
		return await r.json();
	});
</script>

<div id="roomListHeader">
	<h3 class="menuHeader">ROOM BROWSER</h3>
	<button class="smallMenuButton" onclick={() => refreshTick++}>REFRESH</button>
</div>
<div id="roomSelector" style:pointer-events={st.player.dead ? "none" : "auto"}>
	<svelte:boundary>
		{#snippet pending()}
			Loading...
		{/snippet}
		{#each await rooms as room}
			{@const full = room.pl >= room.mxpl && st.room !== room.n}
			<div
				class="roomSelectItem"
				class:roomSelectItemSelected={st.room === room.n}
				class:roomSelectItemFull={full}
				onclick={() => { if (!full) window.joinRoom(room.n) }}
			>
				<b>{`${room.m}_${room.n}`}</b>
				<b>{full ? "FULL" : `${room.lb}% - ${room.pl}/${room.mxpl}`}</b>
			</div>
		{/each}
	</svelte:boundary>
</div>

<style>
	#roomListHeader {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 125%;
		box-sizing: border-box;
		font-size: 12px;
	}
	.menuHeader {
		margin-top: 0px;
		margin-bottom: 10px;
	}

	#roomSelector {
		max-height: 265px;
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
	.roomSelectItemFull {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
