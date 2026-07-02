<script lang="ts">
	import { onMount } from "svelte";
	import type { ClanProfile, LeaderboardData, LeaderboardEntry, LeaderboardType, PlayerProfile } from "../types";
	import NavigationBar from "./NavigationBar.svelte";

	const LB_TYPES_FRIENDLY_NAMES: Record<LeaderboardType, string> = {
		rank: "Rank",
		kdrThousand: "KDR (1000+)",
		kdrAny: "KDR (Any)",
		kills: "Kills",
		clanRank: "Clans (Rank)",
		clanKdr: "Clans (KDR)",
	};

	let selectedLeaderboardType: LeaderboardType = $state("rank");
	let leaderboardUIData: Record<LeaderboardType, LeaderboardEntry[]> = $state({
		rank: [],
		kdrThousand: [],
		kdrAny: [],
		kills: [],
		clanRank: [],
		clanKdr: [],
	});
	const selectedLeaderboard = $derived(leaderboardUIData[selectedLeaderboardType]);

	function getBasePlayerLeaderboardEntry(player: PlayerProfile) {
		return {
			clanText: player.clan ? `[${player.clan.toUpperCase()}]` : "",
			link: `/profile.html?${player.name}`,
		};
	}

	function getPlayerKdrLeaderboardEntry(player: PlayerProfile) {
		return {
			...getBasePlayerLeaderboardEntry(player),
			text: `${player.name} KDR ${player.kdr.toFixed(2)} (${player.numKills}/${player.numDeaths})`,
		};
	}

	function getClanLeaderboardEntry(clan: ClanProfile) {
		return {
			clanText: `[${clan.name}] (${clan.numMembers} members)`,
			text: `RNK ${clan.rank} KDR ${clan.kdr.toFixed(2)}`,
		};
	}

	function onClickLeaderboardEntry(leaderboardEntry: LeaderboardEntry) {
		if (leaderboardEntry.link) {
			window.open(leaderboardEntry.link, "_blank");
		}
	}

	onMount(async () => {
		const res = await fetch("/api/getLbs");
		const leaderboardData: LeaderboardData = await res.json();

		leaderboardUIData.rank = leaderboardData.rank.map((player) => ({
			...getBasePlayerLeaderboardEntry(player),
			text: `${player.name} RNK ${player.rank}`,
		}));

		leaderboardUIData.kdrThousand = leaderboardData.kdrThousand.map(getPlayerKdrLeaderboardEntry);
		leaderboardUIData.kdrAny = leaderboardData.kdrAny.map(getPlayerKdrLeaderboardEntry);

		leaderboardUIData.kills = leaderboardData.kills.map((player) => ({
			...getBasePlayerLeaderboardEntry(player),
			text: `${player.name} ${player.numKills} KILLS`,
		}));

		leaderboardUIData.clanRank = leaderboardData.clanRank.map(getClanLeaderboardEntry);
		leaderboardUIData.clanKdr = leaderboardData.clanKdr.map(getClanLeaderboardEntry);
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
					<div class="leaderboardItemWrapper" onclick={() => onClickLeaderboardEntry(entry)}>
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
