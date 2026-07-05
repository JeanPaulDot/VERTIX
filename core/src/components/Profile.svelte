<script lang="ts">
	import { onMount } from "svelte";
	import NavigationBar from "./NavigationBar.svelte";

	type UnlockedItem = { type: "hat" | "shirt" | "camo"; name: string; chance: number };
	type ProfileData = {
		name: string;
		clan: string | null;
		rank: number;
		worldRank: number;
		score: number;
		kdr: number;
		kills: number;
		deaths: number;
		likes: number;
		numHats: number;
		avatar: string | null;
		unlocks: UnlockedItem[];
	};
	type OnlinePlayer = { name: string; room: string; mode: string };
	type DiscordFriend = { username: string; discordName: string; avatar: string; online: boolean };
	type FriendsData = {
		online: OnlinePlayer[];
		discord: DiscordFriend[] | null;
		selfDiscordConnected: boolean;
		loggedIn: boolean;
	};

	let profile: ProfileData | null = $state(null);
	let friends: FriendsData | null = $state(null);
	let serverMessage = $state("");

	const userNameVar = decodeURIComponent(window.location.search.substring(1));

	// rarity tiers mirror the server's unlock economy (server/unlocks.ts)
	function rarityOf(chance: number) {
		if (chance >= 90) return { label: "Common", color: "#9e9e9e" };
		if (chance >= 20) return { label: "Uncommon", color: "#4caf50" };
		if (chance >= 5) return { label: "Rare", color: "#2196f3" };
		if (chance >= 0.5) return { label: "Epic", color: "#9c27b0" };
		return { label: "Legendary", color: "#ff9800" };
	}

	function abbreviateNumber(value: number) {
		if (value < 1000) return value.toString();

		const suffixes = ["", "k", "m", "b", "t"];
		const suffixIndex = Math.floor(Math.log10(value) / 3);
		const shortValue = value / 1000 ** suffixIndex;

		const formatted = parseFloat(shortValue.toPrecision(2)).toString();

		return `${formatted}${suffixes[suffixIndex]}`;
	}

	onMount(async () => {
		if (!userNameVar) {
			serverMessage = "No profile found.";
			return;
		}
		try {
			const res = await fetch(`/api/profile/${encodeURIComponent(userNameVar)}`);
			if (!res.ok) {
				serverMessage = res.status === 404 ? "Player not found." : "Failed to load profile.";
				return;
			}
			profile = await res.json();
		} catch {
			serverMessage = "Connection failed. Try again later.";
			return;
		}
		try {
			const res = await fetch("/api/friends");
			if (res.ok) friends = await res.json();
		} catch {
			// friends box just stays in its loading state; the profile itself loaded fine
		}
	});
</script>

<NavigationBar currentPage="profile" />
<div id="content" class="clearfix">
	<section id="left">
		{#if profile}
			<div id="userStats" class="clearfix">
				<div class="pic">
					<img
						id="userProfileImg"
						src={profile.avatar || "./assets/favicon.png"}
						alt={profile.name}
						width="102px"
						height="102px"
					>
				</div>
				<div class="data">
					<h1 id="userName">{profile.name}</h1>
					<h3 id="userClanName">{profile.clan ? `[${profile.clan.toUpperCase()}]` : "NO CLAN"}</h3>
					<ul class="numbers clearfix">
						<li>World<strong id="userWorldRank">#{profile.worldRank}</strong></li>
						<li>Rank<strong id="userRank">{profile.rank}</strong></li>
						<li>KDR<strong id="userKDR">{profile.kdr.toFixed(2)}</strong></li>
						<li>Kills<strong id="userKills">{abbreviateNumber(profile.kills)}</strong></li>
						<li>Deaths<strong id="userDeaths">{abbreviateNumber(profile.deaths)}</strong></li>
						<li>Score<strong id="userScore">{abbreviateNumber(profile.score)}</strong></li>
						<li>Hats<strong id="userHats">{profile.numHats}</strong></li>
						<li>Likes<strong id="userLikes">{abbreviateNumber(profile.likes)}</strong></li>
					</ul>
				</div>
			</div>
		{:else if !serverMessage}
			<div id="userStats" class="clearfix">
				<div class="data"><h1>Loading...</h1></div>
			</div>
		{/if}
		<h1 id="serverMessage">{serverMessage}</h1>
	</section>
	<section id="right">
		<div class="gcontent">
			<div class="head"><h1>Achievements ({profile?.unlocks.length ?? 0})</h1></div>
			<div class="boxy">
				{#if profile && profile.unlocks.length > 0}
					<ul class="unlockList">
						{#each profile.unlocks as unlock}
							<li>
								<span class="rarityDot" style="background: {rarityOf(unlock.chance).color}"></span>
								<span class="unlockName">{unlock.name}</span>
								<span class="unlockMeta" style="color: {rarityOf(unlock.chance).color}">
									{rarityOf(unlock.chance).label}
									{unlock.type}
								</span>
							</li>
						{/each}
					</ul>
				{:else if profile}
					<p>Nothing unlocked yet.</p>
				{:else}
					<p>Loading...</p>
				{/if}
			</div>
		</div>
		<div class="gcontent">
			<div class="head"><h1>Friends ({friends?.discord?.length ?? 0})</h1></div>
			<div class="boxy">
				{#if friends?.discord && friends.discord.length > 0}
					<ul class="friendList">
						{#each friends.discord as friend}
							<li>
								<a href={`/profile.html?${encodeURIComponent(friend.username)}`}>
									{#if friend.avatar}
										<img class="friendAvatar" src={friend.avatar} alt="">
									{/if}
									{friend.username}
								</a>
								{#if friend.online}
									<span class="onlineBadge">ONLINE</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else if friends?.discord}
					<p>No other players have linked Discord yet.</p>
				{:else if friends && !friends.loggedIn}
					<p>Log in from the game menu to see friends.</p>
				{:else if friends}
					<p>Link Discord from the game menu to find friends who play Vertix.</p>
				{:else}
					<p>Loading...</p>
				{/if}
				<p><a href="/friends.html">See who's playing now →</a></p>
			</div>
		</div>
	</section>
</div>

<style>
	a {
		color: #3c86b7;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	ul {
		line-height: 120%;
	}

	p {
		font-size: 1.2em;
		line-height: 1.4em;
		font-family: Arial, sans-serif;
		color: #333;
		margin-bottom: 15px;
	}

	h1 {
		font-family: Helvetica, Arial, Verdana, sans-serif;
		color: #444;
		font-weight: bold;
		font-size: 1.7em;
		line-height: 2em;
	}

	h3 {
		color: #698216;
		font-weight: normal;
		font-size: 1.3em;
		line-height: 1.6em;
	}

	#content {
		display: block;
		width: 820px;
		margin: 0 auto;
	}

	#left {
		display: block;
		width: 560px;
		float: left;
		margin-right: 20px;
	}

	#right {
		display: block;
		width: 240px;
		float: left;
		overflow: hidden;
	}

	#userStats {
		display: block;
		width: auto;
		background-color: #fff;
		padding: 12px;
		box-shadow: inset 0 -5px #e0e0e0;
	}

	#userStats .pic {
		float: left;
		display: block;
		margin-right: 10px;
		image-rendering: pixelated;
	}

	#userStats .pic img {
		border-radius: 4px;
	}

	#userStats .data {
		float: left;
		display: block;
		position: relative;
		width: 79%;
		padding: 4px;
		padding-left: 15px;
		background: #e6e6e6;
		overflow: hidden;
		box-sizing: border-box;
	}

	#serverMessage {
		font-size: 25px;
		color: #fff;
	}

	#userStats .data h1 {
		color: #474747;
		display: inline-block;
		line-height: 1.6em;
		font-size: 28px;
		text-shadow: 0px 1px 1px #fff;
	}

	#userStats .data h3 {
		display: inline-block;
		color: #666;
		line-height: 1.6em;
		margin-bottom: 5px;
		font-size: 18px;
		padding: 10px;
	}

	#userStats .data ul.numbers {
		list-style: none;
		padding-top: 7px;
		margin-bottom: 10px;
		color: #676767;
		margin-left: 0px;
		display: block;
	}

	#userStats .data ul.numbers li {
		float: left;
		text-align: left;
		display: block;
		margin-top: 5px;
		padding-left: 0px;
		margin-bottom: 0px;
		padding-right: 10px;
		margin-right: 10px;
		border-right: 1px dotted #bbb;
		text-transform: uppercase;
	}

	#userStats .data ul.numbers li:last-of-type {
		border-right: 0px;
	}

	#userStats .data ul.numbers li strong {
		color: #434343;
		display: block;
		font-size: 26px;
		line-height: 1.1em;
		font-weight: bold;
	}

	#right .gcontent {
		display: block;
		margin-bottom: 20px;
	}

	#right .gcontent .head {
		background: #76b3e3;
		padding-left: 8px;
	}

	#right .gcontent .head h1 {
		color: #fff;
		font-weight: bold;
		font-size: 1.4em;
	}

	#right .gcontent .boxy {
		padding: 10px 8px;
		background: #fff;
		box-shadow: inset 0 -5px #e0e0e0;
	}

	.unlockList,
	.friendList {
		list-style: none;
		margin: 0 0 10px 0;
		padding: 0;
		max-height: 300px;
		overflow-y: auto;
		font-family: Arial, sans-serif;
	}

	.unlockList li,
	.friendList li {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 2px;
		font-size: 14px;
		color: #333;
		border-bottom: 1px dotted #ddd;
	}

	.unlockList li:last-of-type,
	.friendList li:last-of-type {
		border-bottom: 0;
	}

	.rarityDot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.unlockName {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unlockMeta {
		font-size: 11px;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.friendList a {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.friendAvatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}

	.onlineBadge {
		background: #4caf50;
		color: #fff;
		font-size: 10px;
		font-weight: bold;
		padding: 1px 5px;
		border-radius: 3px;
		flex-shrink: 0;
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
