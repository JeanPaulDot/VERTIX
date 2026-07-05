<script lang="ts">
	import { onMount } from "svelte";
	import {
		emptyLeaderboardUIData,
		fetchLeaderboards,
		LB_TYPES_FRIENDLY_NAMES,
		openLeaderboardEntry,
		type LeaderboardUIData,
	} from "../leaderboardData.ts";
	import type { LeaderboardType } from "../types";
	import NavigationBar from "./NavigationBar.svelte";

	let selectedLeaderboardType: LeaderboardType = $state("rank");
	let leaderboardUIData: LeaderboardUIData = $state(emptyLeaderboardUIData());
	const selectedLeaderboard = $derived(leaderboardUIData[selectedLeaderboardType]);

	onMount(async () => {
		leaderboardUIData = await fetchLeaderboards();
	});
</script>
<NavigationBar currentPage="leaderboards" />
<div id="content" class="clearfix">
	<section id="left">
		<div class="contentCard">
			<div class="leaderboardsTitle"><b>Leaderboards</b></div>
			{#each Object.entries(LB_TYPES_FRIENDLY_NAMES) as [ type, friendlyName ]}
				<div
					onclick={() => selectedLeaderboardType = type as LeaderboardType}
					class:activeButton={selectedLeaderboardType === type}
					class="changeLeaderboardButton"
				>
					<b>{friendlyName}</b>
				</div>
			{/each}
			<div class="leaderboardContainer">
				{#each selectedLeaderboard as entry, i}
					<div class="leaderboardItemWrapper" onclick={() => openLeaderboardEntry(entry)}>
						{i + 1}.
						<span class="clanDisplay">{entry.clanText}</span>
						<span class="leaderNameDisplay">{entry.text}</span>
					</div>
				{:else}
					<div class="leaderMessage"><b>Loading...</b></div>
				{/each}
			</div>
		</div>
	</section>
</div>
<style>
	.leaderboardsTitle {
		color: #969696;
		padding: 10px;
		font-size: 25px;
		margin-top: 5px;
	}

	.leaderboardContainer {
		font-size: 16px;
		padding: 10px;
	}

	.leaderboardItemWrapper {
		margin-bottom: 1px;
		padding: 12px;
		font-weight: bold;
		cursor: pointer;
	}

	.leaderboardItemWrapper:hover {
		background-color: #e6e6e6;
	}

	.leaderMessage {
		color: rgba(0, 0, 0, 0.4);
		padding: 10px;
	}

	.changeLeaderboardButton {
		cursor: pointer;
		display: inline-block;
		padding: 15px;
		font-size: 16px;
		margin-top: 10px;
		margin-left: 10px;
		color: rgba(0, 0, 0, 0.5);
		background: rgba(0, 0, 0, 0.1);
	}

	.activeButton {
		background: rgba(0, 0, 0, 0.2);
	}

	.leaderNameDisplay {
		color: rgba(0, 0, 0, 0.5);
	}

	.clanDisplay {
		color: rgba(0, 0, 0, 0.7);
	}

	#content {
		display: block;
		width: 820px;
		margin: 0 auto;
	}

	.contentCard {
		padding: 10px;
		box-shadow: inset 0 -5px #e0e0e0;
		background-color: white;
		box-sizing: border-box;
	}

	#left {
		display: block;
		width: 560px;
		float: left;
		margin-right: 20px;
	}

	.clearfix:after {
		content: ".";
		display: block;
		clear: both;
		visibility: hidden;
		line-height: 0;
		height: 0;
	}

	.clearfix {
		display: inline-block;
	}
</style>
