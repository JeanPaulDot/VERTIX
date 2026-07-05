<script lang="ts">
	import { st } from "../../state.svelte.ts";

	function claimQuest(questId: number) {
		st.socket?.emit("claimQuest", { questId });
	}

	function claimStreak() {
		st.socket?.emit("claimStreak");
	}

	function streakDayStyle(day: number): { bg: string; border: string; color: string; label: string } {
		const current = st.quests.streak.day;
		const done = day < current || (day === 7 && current === 7 && st.quests.streak.claimed);
		const today = day === current + 1 || (day === 7 && current === 7 && !st.quests.streak.claimed);

		return {
			bg: done ? "#76b3e3" : today ? "#fff" : "#f2f2f2",
			border: today ? "solid 2px #76b3e3" : "solid 2px transparent",
			color: done ? "#fff" : today ? "#6fa9d6" : "rgba(0,0,0,0.35)",
			label: day === 7 ? "\u2605" : `D${day}`,
		};
	}
</script>

{#if !st.loggedIn}
	<!-- quests/rewards require an account -->
	<div class="questsLocked">
		<h3 class="menuHeaderTabbed2">QUESTS &amp; REWARDS</h3>
		<p>Log in with Discord to complete daily quests, keep a login streak, and earn reward crates.</p>
		<button type="button" class="smallMenuButton" onclick={() => (st.menuModal = "account")}>
			LOG IN
		</button>
	</div>
{:else}
<!-- DAILY QUESTS -->
<div class="cardHeaderRow">
	<h3 class="menuHeaderTabbed2">DAILY QUESTS</h3>
	<span class="cardHeaderHint">RESETS IN {st.quests.dailyReset}</span>
</div>
<div class="questList">
	{#each st.quests.daily as quest}
		<div class="questRow" class:questClaimed={quest.claimed}>
			<div class="questTop">
				<b class="questName">{quest.name}</b>
				<span class="questReward">{quest.reward}</span>
			</div>
			<div class="questBottom">
				<div class="questBar">
					<div class="questBarFill" style:width={`${Math.min(100, Math.round((quest.progress / quest.goal) * 100))}%`}></div>
				</div>
				<span class="questProgress">{quest.progress.toLocaleString()}/{quest.goal.toLocaleString()}</span>
				{#if quest.claimable}
					<button type="button" class="smallMenuButton questClaimBtn" onclick={() => claimQuest(quest.id)}>CLAIM</button>
				{:else if quest.claimed}
					<span class="questClaimedText">CLAIMED</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<!-- WEEKLY CHALLENGE -->
<div class="cardHeaderRow">
	<h3 class="menuHeaderTabbed2">WEEKLY CHALLENGE</h3>
	<span class="cardHeaderHint">RESETS IN {st.quests.weeklyReset}</span>
</div>
{#if st.quests.weekly}
	{@const w = st.quests.weekly}
	<div class="questRow">
		<div class="questTop">
			<b class="questName">{w.name}</b>
			<span class="questReward">{w.reward}</span>
		</div>
		<div class="questBottom">
			<div class="questBar questBarWeekly">
				<div class="questBarFillWeekly" style:width={`${Math.min(100, Math.round((w.progress / w.goal) * 100))}%`}></div>
			</div>
			<span class="questProgress">{w.progress.toLocaleString()}</span>
		</div>
	</div>
{/if}

<!-- LOGIN STREAK -->
<div class="cardHeaderRow">
	<h3 class="menuHeaderTabbed2">LOGIN STREAK</h3>
	<span class="cardHeaderHint">DAY 7: +1 CRATE</span>
</div>
<div class="streakRow">
	{#each Array(7) as _, i}
		{@const day = i + 1}
		{@const s = streakDayStyle(day)}
		<div
			class="streakDay"
			style:background={s.bg}
			style:border={s.border}
			style:color={s.color}
		>{s.label}</div>
	{/each}
</div>
{/if}

<style>
	.questsLocked {
		text-align: center;
	}
	.questsLocked p {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.55);
		line-height: 1.4;
		margin: 8px 0 12px;
	}
	.cardHeaderRow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.cardHeaderRow h3 {
		margin-bottom: 10px;
	}
	.cardHeaderHint {
		font-size: 11px;
		color: rgba(0, 0, 0, 0.45);
	}

	.questList {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.questRow {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.questClaimed {
		opacity: 0.45;
	}

	.questTop {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.questName {
		color: rgba(0, 0, 0, 0.7);
		font-size: 12px;
	}
	.questReward {
		font-size: 11px;
		color: #b8860b;
		white-space: nowrap;
	}

	.questBottom {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.questBar {
		flex: 1;
		background: rgba(0, 0, 0, 0.1);
		height: 10px;
	}
	.questBarFill {
		background: #76b3e3;
		height: 10px;
	}
	.questBarWeekly {
		background: rgba(0, 0, 0, 0.1);
		height: 10px;
	}
	.questBarFillWeekly {
		background: #5151d9;
		height: 10px;
	}

	.questProgress {
		font-size: 11px;
		color: rgba(0, 0, 0, 0.5);
		flex: none;
		min-width: 44px;
		text-align: right;
	}

	.questClaimBtn {
		flex: none;
		margin-bottom: 0;
		padding: 4px 8px;
		font-size: 11px;
	}
	.questClaimedText {
		font-size: 11px;
		color: rgba(0, 0, 0, 0.4);
		flex: none;
	}

	.streakRow {
		display: flex;
		gap: 6px;
	}
	.streakDay {
		flex: 1;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		box-sizing: border-box;
	}
</style>
