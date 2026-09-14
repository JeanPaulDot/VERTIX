<script lang="ts">
	import { onMount } from "svelte";
	import { flip } from "svelte/animate";
	import { fade, fly } from "svelte/transition";
	import { st } from "../../state.svelte.ts";
	import { prefersReducedMotion, staggerDelay } from "../../motion.ts";
	import { gameModes } from "../../gamemodes.ts";

	type DiscordFriend = {
		username: string;
		discordName: string;
		avatar: string;
		online: boolean;
	};

	type FriendsResponse = {
		discord: DiscordFriend[] | null;
		discordTotal: number;
		page: number;
		hasMore: boolean;
		selfDiscordConnected: boolean;
		loggedIn: boolean;
	};

	interface Props {
		onOpenProfile: (username: string) => void;
	}
	const { onOpenProfile }: Props = $props();

	let directory: DiscordFriend[] = $state([]);
	let total = $state(0);
	let page = $state(1);
	let hasMore = $state(false);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state("");
	let search = $state("");
	let selfLinked = $state(false);
	let loggedIn = $state(false);

	// Presence is pushed over the lobby socket, so this list is live — it is not
	// re-fetched. The directory below still needs a request (it is a DB scan and
	// nobody's Discord link changes mid-session).
	const online = $derived(st.presence);
	const modeName = (code: string) =>
		gameModes.find((m) => m.code === code)?.name ?? code.toUpperCase();

	// Everyone signed in and playing right now, so a friend row can show where
	// they are. Keyed on the account, never the typed display name.
	const onlineAccounts = $derived(
		new Map(online.filter((p) => p.account).map((p) => [p.account as string, p])),
	);

	const flipDuration = $derived(prefersReducedMotion() ? 0 : 260);

	async function load(nextPage: number, append: boolean) {
		if (append) loadingMore = true;
		else loading = true;
		error = "";
		try {
			const params = new URLSearchParams({ page: String(nextPage), limit: "50" });
			if (search.trim()) params.set("q", search.trim());
			const res = await fetch(`/api/friends?${params}`);
			if (!res.ok) throw new Error(`friends unavailable (${res.status})`);
			const data: FriendsResponse = await res.json();
			selfLinked = data.selfDiscordConnected;
			loggedIn = data.loggedIn;
			const rows = data.discord ?? [];
			directory = append ? [...directory, ...rows] : rows;
			total = data.discordTotal ?? rows.length;
			page = data.page ?? nextPage;
			hasMore = !!data.hasMore;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load friends";
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	onMount(() => load(1, false));

	// debounce the search so typing doesn't fire a request per keystroke
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => load(1, false), 250);
	}
</script>

<input
	class="socialSearch"
	type="text"
	placeholder="SEARCH FRIENDS"
	bind:value={search}
	oninput={onSearchInput}
/>

<div class="socialPanel">
	<h3 class="socialHeading">
		PLAYING NOW
		{#if online.length}<span class="socialTabCount">{online.length}</span>{/if}
	</h3>

	{#if online.length === 0}
		<div class="socialEmpty">Nobody is in a game right now. Be the first.</div>
	{:else}
		<div class="socialList">
			{#each online as player, i (player.name + player.room)}
				<div
					class="socialRow"
					animate:flip={{ duration: flipDuration }}
					in:fly={{ y: 10, duration: 220, delay: staggerDelay(i) }}
					out:fade={{ duration: 140 }}
				>
					<span class="socialOnlineDot" aria-hidden="true"></span>
					<div class="socialRowMain">
						{#if player.account}
							<button
								type="button"
								class="socialLinkButton socialRowName"
								onclick={() => onOpenProfile(player.account as string)}
							>
								{player.name}
							</button>
						{:else}
							<span class="socialRowName">{player.name} <em>(guest)</em></span>
						{/if}
						<span class="socialRowSub">
							{modeName(player.mode)} · {player.room}{player.ranked ? "" : " · UNRANKED"}
						</span>
					</div>
					<button
						type="button"
						class="socialJoin"
						onclick={() => window.joinRoom?.(player.room)}
					>
						JOIN
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<h3 class="socialHeading socialHeadingSpaced">
		DISCORD PLAYERS
		{#if total}<span class="socialTabCount">{total}</span>{/if}
	</h3>

	{#if loading}
		<div class="socialEmpty">Loading…</div>
	{:else if error}
		<div class="socialEmpty">{error}</div>
	{:else if !loggedIn}
		<div class="socialEmpty">Sign in with Discord to see who else is here.</div>
	{:else if !selfLinked}
		<div class="socialEmpty">Link your Discord account to see the player directory.</div>
	{:else if directory.length === 0}
		<div class="socialEmpty">
			{search.trim() ? `Nobody matching "${search.trim()}".` : "No other linked players yet."}
		</div>
	{:else}
		<div class="socialList">
			{#each directory as friend, i (friend.username)}
				{@const at = onlineAccounts.get(friend.username)}
				<div
					class="socialRow"
					animate:flip={{ duration: flipDuration }}
					in:fly={{ y: 10, duration: 220, delay: staggerDelay(i) }}
				>
					{#if friend.avatar}
						<img class="socialAvatar" src={friend.avatar} alt="" loading="lazy">
					{:else}
						<span class="socialAvatar" aria-hidden="true"></span>
					{/if}
					<div class="socialRowMain">
						<button
							type="button"
							class="socialLinkButton socialRowName"
							onclick={() => onOpenProfile(friend.username)}
						>
							{friend.username}
						</button>
						<span class="socialRowSub">@{friend.discordName}</span>
					</div>
					{#if at}
						<span class="socialOnlineDot" aria-hidden="true"></span>
						<button type="button" class="socialJoin" onclick={() => window.joinRoom?.(at.room)}>
							JOIN
						</button>
					{:else}
						<span class="socialRowMeta">offline</span>
					{/if}
				</div>
			{/each}
		</div>

		{#if hasMore}
			<button
				type="button"
				class="socialMore"
				disabled={loadingMore}
				onclick={() => load(page + 1, true)}
			>
				{loadingMore ? "LOADING…" : `SHOW MORE (${total - directory.length} left)`}
			</button>
		{/if}
	{/if}
</div>

<style>
	.socialHeading {
		margin: 0 0 8px;
		font-size: 13px;
		color: #969696;
	}
	.socialHeadingSpaced {
		margin-top: 18px;
	}
	.socialLinkButton {
		padding: 0;
		font-size: inherit;
		color: #3c86b7;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: color var(--dur-fast) ease;
	}
	.socialLinkButton:hover {
		color: var(--blue);
		text-decoration: underline;
	}
	.socialMore {
		width: 100%;
		margin-top: 8px;
		padding: 9px;
		font-size: 13px;
		color: var(--ink);
		background: var(--row-inset);
		border: none;
		border-radius: 1px;
		cursor: pointer;
		box-shadow: inset 0 -3px var(--card-shadow);
		transition: background-color var(--dur-fast) ease;
	}
	.socialMore:hover:not(:disabled) {
		background: var(--row-hover);
	}
	.socialMore:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
