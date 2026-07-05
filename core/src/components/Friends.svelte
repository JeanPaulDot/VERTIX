<script lang="ts">
	import { onMount } from "svelte";
	import NavigationBar from "./NavigationBar.svelte";

	type OnlinePlayer = { name: string; room: string; mode: string };
	type DiscordFriend = { username: string; discordName: string; avatar: string; online: boolean };
	type FriendsData = {
		online: OnlinePlayer[];
		discord: DiscordFriend[] | null;
		selfDiscordConnected: boolean;
		loggedIn: boolean;
	};

	let data: FriendsData | null = $state(null);

	async function refresh() {
		const res = await fetch("/api/friends");
		data = await res.json();
	}

	onMount(refresh);
</script>

<NavigationBar currentPage="friends" />
<div id="content" class="clearfix">
	<section id="left">
		<div class="contentCard">
			<div class="friendsHeader">
				<div class="friendsTitle"><b>Playing Now</b></div>
				<div class="refreshButton" onclick={refresh}><b>Refresh</b></div>
			</div>
			{#if data}
				<div class="friendsContainer">
					{#each data.online as player}
						<div class="friendRow">
							<a class="friendName" target="_blank" href={`/profile.html?${player.name}`}>
								{player.name}
							</a>
							<span class="friendMeta">
								{player.mode}_{player.room}
								<a class="joinLink" target="_blank" href={`/?${player.room}`}>JOIN</a>
							</span>
						</div>
					{:else}
						<div class="friendsMessage"><b>Nobody is playing right now.</b></div>
					{/each}
				</div>

				<div class="friendsTitle"><b>Discord Friends</b></div>
				{#if data.discord}
					<div class="friendsContainer">
						{#each data.discord as friend}
							<div class="friendRow">
								<a class="friendName" target="_blank" href={`/profile.html?${friend.username}`}>
									{#if friend.avatar}
										<img class="friendAvatar" src={friend.avatar} alt="">
									{/if}
									{friend.username}
								</a>
								<span class="friendMeta">
									@{friend.discordName}
									{#if friend.online}
										<span class="onlineBadge">ONLINE</span>
									{/if}
								</span>
							</div>
						{:else}
							<div class="friendsMessage"><b>No other players have linked Discord yet.</b></div>
						{/each}
					</div>
				{:else if !data.loggedIn}
					<div class="friendsMessage">
						<b>Log in from the game menu to find friends.</b>
					</div>
				{:else}
					<div class="friendsMessage">
						<b>Connect your account to Discord (log in with Discord from the game menu) to find friends who play Vertix.</b>
					</div>
				{/if}
			{:else}
				<div class="friendsMessage"><b>Loading...</b></div>
			{/if}
		</div>
	</section>
</div>
<style>
	.friendsHeader {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.friendsTitle {
		color: #969696;
		padding: 10px;
		font-size: 25px;
		margin-top: 5px;
	}

	.refreshButton {
		cursor: pointer;
		padding: 10px 15px;
		margin-right: 10px;
		font-size: 14px;
		color: rgba(0, 0, 0, 0.5);
		background: rgba(0, 0, 0, 0.1);
	}

	.refreshButton:hover {
		background: rgba(0, 0, 0, 0.2);
	}

	.friendsContainer {
		font-size: 16px;
		padding: 10px;
	}

	.friendRow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1px;
		padding: 12px;
		font-weight: bold;
	}

	.friendRow:hover {
		background-color: #e6e6e6;
	}

	.friendName {
		color: #3c86b7;
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.friendName:hover {
		text-decoration: underline;
	}

	.friendAvatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
	}

	.friendMeta {
		color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.joinLink {
		color: #fff;
		background: #76b3e3;
		box-shadow: inset 0 -3px #6fa9d6;
		padding: 4px 10px;
		text-decoration: none;
		font-size: 13px;
	}

	.joinLink:hover {
		background: #6fa9d6;
		box-shadow: none;
	}

	.onlineBadge {
		color: #fff;
		background: #6fbf6f;
		padding: 2px 8px;
		font-size: 12px;
	}

	.friendsMessage {
		color: rgba(0, 0, 0, 0.4);
		padding: 10px;
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
