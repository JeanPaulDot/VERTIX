<script lang="ts">
	import { getItemRarityColor } from "../utils.ts";
	import { st } from "../state.svelte.ts";
	import Modal from "./common/Modal.svelte";
	import CrateReel from "./CrateReel.svelte";

	function close() {
		st.rewardPopup = null;
	}

	function openCrateNow() {
		close();
		st.socket?.emit("openCrate");
	}
</script>

{#if st.rewardPopup?.kind === "unlocks"}
	<Modal open title="Unlocked!" onclose={close}>
		<div class="rewardList">
			{#each st.rewardPopup.items as item}
				<div class="rewardItem" style:color={getItemRarityColor(item.chance)}>
					<b>{item.name}</b>
				</div>
			{/each}
		</div>
	</Modal>
{:else if st.rewardPopup?.kind === "rankUp"}
	<Modal open title="Rank Up!" onclose={close}>
		<div class="rewardBody">
			<p>You reached <b>Rank {st.rewardPopup.rank}</b>!</p>
			<p>A Reward Crate is waiting for you on the main menu.</p>
		</div>
	</Modal>
{:else if st.rewardPopup?.kind === "pendingCrates"}
	<Modal open title="Reward Crates Waiting" onclose={close}>
		<div class="rewardBody">
			<p>
				You have <b>{st.rewardPopup.count}</b> unopened Reward Crate{st.rewardPopup.count === 1 ? "" : "s"}!
			</p>
			<button type="button" class="smallMenuButton" onclick={openCrateNow}>OPEN ONE NOW</button>
		</div>
	</Modal>
{:else if st.rewardPopup?.kind === "crateOpen"}
	<Modal open title="Reward Crate" onclose={close}>
		{#if st.rewardPopup.won}
			{#key st.rewardPopup}
				<CrateReel won={st.rewardPopup.won} onDone={close} />
			{/key}
		{:else}
			<div class="rewardBody">
				<p>You already own everything obtainable right now!</p>
			</div>
		{/if}
	</Modal>
{/if}

<style>
	.rewardBody {
		min-width: 220px;
		text-align: center;
	}
	.rewardList {
		min-width: 220px;
	}
	.rewardItem {
		padding: 10px;
		font-size: 18px;
		text-align: center;
	}
</style>
