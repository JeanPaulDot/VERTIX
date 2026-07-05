<script lang="ts">
	import { onMount } from "svelte";
	import type { ClanProfile } from "../types.ts";
	import NavigationBar from "./NavigationBar.svelte";

	type ClanDetail = {
		name: string;
		founder: string;
		members: string[];
		rank: number;
		kd: number;
		chatURL: string;
	};

	const detailName = window.location.search.substring(1) || null;

	let clans: ClanProfile[] = $state([]);
	let loading = $state(true);
	let searchQuery = $state("");
	let sortBy: "rank" | "kdr" = $state("rank");

	let detail: ClanDetail | null = $state(null);
	let detailMessage = $state("");

	const filteredClans = $derived(
		clans
			.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
			.toSorted((a, b) => (sortBy === "kdr" ? b.kdr - a.kdr : b.rank - a.rank)),
	);

	onMount(async () => {
		if (detailName) {
			const res = await fetch(`/api/clan/${encodeURIComponent(detailName)}`);
			if (res.ok) {
				detail = await res.json();
			} else {
				detailMessage = "Clan not found.";
			}
			return;
		}
		const res = await fetch("/api/clans");
		clans = await res.json();
		loading = false;
	});
</script>

<NavigationBar currentPage="clans" />
<div id="content" class="clearfix">
	<section id="left">
		<div class="contentCard">
			{#if detailName}
				<div class="clansTitle"><b>Clan: [{detailName.toUpperCase()}]</b></div>
				{#if detail}
					<div class="clanDetailStats">
						<div><b>Founder: </b>{detail.founder}</div>
						<div><b>Rank: </b>{detail.rank}</div>
						<div><b>Avg KD: </b>{detail.kd}</div>
						{#if detail.chatURL}
							<div>
								<b>Chat: </b>
								<a target="_blank" rel="noopener" href={detail.chatURL.startsWith("http") ? detail.chatURL : `https://${detail.chatURL}`}>
									{detail.chatURL}
								</a>
							</div>
						{/if}
					</div>
					<div class="clansTitle" style="font-size:18px;"><b>Roster ({detail.members.length})</b></div>
					<div class="leaderboardContainer">
						{#each detail.members as member}
							<div class="leaderboardItemWrapper">
								<span class="leaderNameDisplay">{member}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="leaderMessage"><b>{detailMessage || "Loading..."}</b></div>
				{/if}
				<div class="clansBackLink"><a href="./clans.html">&laquo; Back to Clans</a></div>
			{:else}
				<div class="clansTitle"><b>Clans</b></div>
				<div class="clansControls">
					<input
						class="clansSearchInput"
						placeholder="Search clans..."
						bind:value={searchQuery}
					>
					<div
						class="changeLeaderboardButton"
						class:activeButton={sortBy === "rank"}
						onclick={() => sortBy = "rank"}
					>
						<b>Rank</b>
					</div>
					<div
						class="changeLeaderboardButton"
						class:activeButton={sortBy === "kdr"}
						onclick={() => sortBy = "kdr"}
					>
						<b>KDR</b>
					</div>
				</div>
				<div class="leaderboardContainer">
					{#each filteredClans as clan}
						<a class="leaderboardItemWrapper clanRowLink" href={`/clans.html?${clan.name}`}>
							[{clan.name}] ({clan.numMembers} members)
							<span class="leaderNameDisplay">RNK {clan.rank} KDR {clan.kdr.toFixed(2)}</span>
						</a>
					{:else}
						<div class="leaderMessage"><b>{loading ? "Loading..." : "No clans found."}</b></div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>
<style>
	.clansTitle {
		color: #969696;
		padding: 10px;
		font-size: 25px;
		margin-top: 5px;
	}

	.clansControls {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-left: 10px;
	}

	.clansSearchInput {
		padding: 10px;
		border: solid 1px #dcdcdc;
		border-radius: 1px;
		font-size: 14px;
		flex: 1;
		box-sizing: border-box;
	}

	.leaderboardContainer {
		font-size: 16px;
		padding: 10px;
	}

	.leaderboardItemWrapper {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1px;
		padding: 12px;
		font-weight: bold;
		cursor: pointer;
		text-decoration: none;
		color: inherit;
	}

	.clanRowLink {
		display: flex;
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
		padding: 10px 15px;
		font-size: 14px;
		color: rgba(0, 0, 0, 0.5);
		background: rgba(0, 0, 0, 0.1);
	}

	.activeButton {
		background: rgba(0, 0, 0, 0.2);
	}

	.leaderNameDisplay {
		color: rgba(0, 0, 0, 0.5);
	}

	.clanDetailStats {
		padding: 10px;
		line-height: 200%;
	}

	.clansBackLink {
		padding: 10px;
	}

	.clansBackLink a {
		color: #3c86b7;
		text-decoration: none;
	}

	.clansBackLink a:hover {
		text-decoration: underline;
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
