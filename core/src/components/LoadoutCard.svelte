<script lang="ts">
	import { st } from "../state.svelte.ts";
	import { getItemRarityColor } from "../utils.ts";
	import LoadoutPreview from "./LoadoutPreview.svelte";
	import LoadoutTab from "./tabs/LoadoutTab.svelte";

	// loadout editing happens inline in this card (no modal)
	let editing = $state(false);

	type Row = { label: string; value: string; color?: string };
	const rows: Row[] = $derived([
		{ label: "Class:", value: st.loadout.class.classN },
		{
			label: "Primary:",
			value: st.loadout.primaryCamo?.name ?? st.loadout.class.pWeapon,
			color: st.loadout.primaryCamo ? getItemRarityColor(st.loadout.primaryCamo.chance) : undefined,
		},
		{
			label: "Secondary:",
			value: st.loadout.secondaryCamo?.name ?? st.loadout.class.sWeapon,
			color: st.loadout.secondaryCamo ? getItemRarityColor(st.loadout.secondaryCamo.chance) : undefined,
		},
		{
			label: "Hat:",
			value: st.loadout.hat?.name ?? "Default",
			color: st.loadout.hat ? getItemRarityColor(st.loadout.hat.chance) : undefined,
		},
		{
			label: "Shirt:",
			value: st.loadout.shirt?.name ?? "Default",
			color: st.loadout.shirt ? getItemRarityColor(st.loadout.shirt.chance) : undefined,
		},
		{ label: "Spray:", value: st.loadout.spray?.name ?? "Strike" },
	]);

	function openCrate() {
		st.socket?.emit("openCrate");
	}
</script>

<div class="cardHeaderRow">
	<h3 class="menuHeaderTabbed2">YOUR LOADOUT</h3>
	<span class="cardHeaderLink" onclick={() => editing = !editing}>{editing ? "DONE" : "EDIT"}</span>
</div>
{#if editing}
	<div id="loadoutEditor">
		<div id="loadoutEditorPreview"><LoadoutPreview /></div>
		<LoadoutTab />
	</div>
{:else}
	<div id="loadoutSummary">
		<div id="loadoutPreviewBox"><LoadoutPreview /></div>
		<div id="loadoutRows">
			{#each rows as row}
				<div class="loadoutRow">
					<b>{row.label}</b>
					<span style:color={row.color}>{row.value}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<div class="cardHeaderRow">
	<h3 class="menuHeaderTabbed2">REWARDS</h3>
	<span class="cardHeaderHint">1 CRATE / RANK UP</span>
</div>
{#if st.loggedIn}
	<div id="crateRow">
		<span class="crateCountText"><b>{st.unopenedCrateCount}</b> unopened crate{st.unopenedCrateCount === 1 ? "" : "s"}</span>
		<button type="button" class="smallMenuButton" disabled={st.unopenedCrateCount <= 0} onclick={openCrate}>
			OPEN CRATE
		</button>
	</div>
	<div id="nextCrateBlock">
		<div id="nextCrateLabels">
			<span>NEXT CRATE — {st.player.account?.rankPercent ?? 0}%</span>
			<span>
				RANK {st.player.account?.rank ?? "..."}
				{#if st.player.account?.score != null}
					— {st.player.account.score.toLocaleString()} SCORE
				{/if}
			</span>
		</div>
		<div id="nextCrateBar">
			<div id="nextCrateFill" style:width={`${st.player.account?.rankPercent ?? 0}%`}></div>
		</div>
	</div>
{:else}
	<div id="rewardsGuestHint">Log in to earn reward crates by ranking up.</div>
{/if}

<style>
	.cardHeaderRow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.cardHeaderRow h3 {
		margin-bottom: 10px;
	}
	.cardHeaderLink {
		cursor: pointer;
		color: var(--blue);
		font-size: 11px;
	}
	.cardHeaderLink:hover {
		text-decoration: underline;
	}
	.cardHeaderHint {
		font-size: 11px;
		color: rgba(0, 0, 0, 0.45);
	}

	#loadoutSummary {
		display: flex;
		gap: 14px;
		align-items: center;
		margin-bottom: 16px;
	}
	#loadoutPreviewBox {
		width: 170px;
		flex: none;
	}
	#loadoutEditor {
		margin-bottom: 16px;
	}
	#loadoutEditorPreview {
		width: 200px;
		margin: 0 auto 8px;
	}
	#loadoutRows {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.loadoutRow {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
	}
	.loadoutRow b {
		color: rgba(0, 0, 0, 0.6);
		flex: none;
	}
	.loadoutRow span {
		color: rgba(0, 0, 0, 0.75);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	#crateRow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		background: #f2f2f2;
		padding: 10px;
		margin-bottom: 10px;
	}
	.crateCountText {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.7);
	}
	.crateCountText b {
		font-size: 15px;
	}
	#crateRow .smallMenuButton:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	#nextCrateBlock {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	#nextCrateLabels {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 11px;
		color: rgba(0, 0, 0, 0.5);
	}
	#nextCrateBar {
		background: rgba(0, 0, 0, 0.1);
		height: 10px;
	}
	#nextCrateFill {
		background: #76b3e3;
		height: 10px;
		transition: width 0.4s;
	}
	#rewardsGuestHint {
		font-size: 12px;
		opacity: 0.6;
	}
</style>
