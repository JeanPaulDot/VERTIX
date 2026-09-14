<script lang="ts">
	import { onMount } from "svelte";
	import { flip } from "svelte/animate";
	import { fade, fly } from "svelte/transition";
	import { st } from "../../state.svelte.ts";
	import type { ClanProfile } from "../../types.ts";
	import StatusMessage from "../common/StatusMessage.svelte";
	import { prefersReducedMotion, staggerDelay } from "../../motion.ts";

	type ClanDetail = {
		name: string;
		founder: string;
		members: string[];
		rank: number;
		kd: number;
		chatURL: string;
	};

	interface Props {
		/** clan to open straight into, set when a leaderboard clan row was clicked */
		focusClan: string | null;
		onClearFocus: () => void;
		onOpenProfile: (username: string) => void;
	}
	const { focusClan, onClearFocus, onOpenProfile }: Props = $props();

	let clans: ClanProfile[] = $state([]);
	let loading = $state(true);
	let search = $state("");
	let sortBy: "rank" | "kdr" = $state("rank");

	let detail = $state<ClanDetail | null>(null);
	let detailLoading = $state(false);
	let detailError = $state("");

	// management fields (only used when the panel shows your own clan)
	let inviteName = $state("");
	let kickName = $state("");
	let chatUrl = $state("");
	let seededChatUrl = false;

	const reduced = $derived(prefersReducedMotion());
	const myClan = $derived(st.player.account?.clan ?? "");
	const isMyClan = $derived(
		myClan !== "" && detail !== null && detail.name.toUpperCase() === myClan.toUpperCase(),
	);
	const inAnyClan = $derived(myClan !== "");

	const filtered = $derived(
		clans
			.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
			.toSorted((a, b) => (sortBy === "kdr" ? b.kdr - a.kdr : b.rank - a.rank)),
	);

	async function loadDirectory() {
		loading = true;
		try {
			const res = await fetch("/api/clans");
			if (res.ok) clans = await res.json();
		} finally {
			loading = false;
		}
	}

	async function openClan(name: string) {
		detailLoading = true;
		detailError = "";
		detail = null;
		try {
			const res = await fetch(`/api/clan/${encodeURIComponent(name)}`);
			if (!res.ok) {
				detailError = res.status === 404 ? "Clan not found." : "Failed to load clan.";
				return;
			}
			detail = await res.json();
		} catch {
			detailError = "Connection failed.";
		} finally {
			detailLoading = false;
		}
	}

	function closeClan() {
		detail = null;
		detailError = "";
		onClearFocus();
	}

	// a leaderboard clan row can deep-link this panel straight into a clan
	$effect(() => {
		if (focusClan && !detail) openClan(focusClan);
	});

	onMount(() => {
		loadDirectory();
		// your own clan opens first — that is the actionable view
		if (myClan) openClan(myClan);
	});

	// seed the chat-URL field once your clan's stats arrive
	$effect(() => {
		if (isMyClan && detail?.chatURL && !seededChatUrl) {
			seededChatUrl = true;
			chatUrl = detail.chatURL;
		}
	});

	function createClan(e: SubmitEvent) {
		e.preventDefault();
		const name = formInputValue(e);
		if (!name) return;
		st.socket?.emit("dbClanCreate", { clanName: name });
		st.messages.clanDB = "Please Wait...";
	}
	function joinClan(e: SubmitEvent) {
		e.preventDefault();
		const name = formInputValue(e);
		if (!name) return;
		st.socket?.emit("dbClanJoin", { clanKey: name });
		st.messages.clanDB = "Please Wait...";
	}
	function formInputValue(e: SubmitEvent): string {
		const form = e.currentTarget as HTMLFormElement | null;
		return form?.querySelector<HTMLInputElement>("input")?.value.trim() ?? "";
	}
	function invite(e: SubmitEvent) {
		e.preventDefault();
		if (!inviteName.trim()) return;
		st.socket?.emit("dbClanInvite", { userName: inviteName.trim() });
		st.messages.clanInv = "Please Wait...";
		inviteName = "";
	}
	function kick(e: SubmitEvent) {
		e.preventDefault();
		if (!kickName.trim()) return;
		st.socket?.emit("dbClanKick", { userName: kickName.trim() });
		st.messages.clanInv = "Please Wait...";
		kickName = "";
	}
	function setChatUrl(e: SubmitEvent) {
		e.preventDefault();
		st.socket?.emit("dbClanChatURL", { chUrl: chatUrl.trim() });
		st.messages.clanCht = "Please Wait...";
	}
	function leaveClan() {
		st.socket?.emit("dbClanLeave");
		detail = null;
	}
</script>

{#if detail}
	<button type="button" class="socialMore clansBack" onclick={closeClan}>&laquo; ALL CLANS</button>

	{#if detailLoading}
		<div class="socialEmpty">Loading…</div>
	{:else if detailError}
		<div class="socialEmpty">{detailError}</div>
	{:else}
		<div class="clanHead" in:fly={{ y: reduced ? 0 : 8, duration: reduced ? 0 : 190 }}>
			<div class="clanHeadMain">
				<h2 class="clanName">[{detail.name.toUpperCase()}]</h2>
				<span class="socialRowSub">FOUNDED BY {detail.founder}</span>
			</div>
			<div class="clanStats">
				<span class="clanStatVal">{detail.rank}</span>
				<span class="socialRowSub">RANK</span>
			</div>
			<div class="clanStats">
				<span class="clanStatVal">{detail.kd.toFixed(2)}</span>
				<span class="socialRowSub">KDR</span>
			</div>
		</div>

		{#if isMyClan && detail.chatURL}
			<a
				class="clanChatLink"
				target="_blank"
				rel="noopener"
				href={detail.chatURL.startsWith("http") ? detail.chatURL : `https://${detail.chatURL}`}
			>
				CLAN CHAT &rarr;
			</a>
		{/if}

		<h3 class="socialHeading socialHeadingSpaced">
			ROSTER
			<span class="socialTabCount">{detail.members.length}</span>
		</h3>
		<div class="socialList">
			{#each detail.members as member, i (member)}
				<div
					class="socialRow"
					animate:flip={{ duration: reduced ? 0 : 260 }}
					in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 220, delay: staggerDelay(i) }}
					out:fade={{ duration: reduced ? 0 : 140 }}
				>
					<div class="socialRowMain">
						<button
							type="button"
							class="socialLinkButton socialRowName"
							onclick={() => onOpenProfile(member)}
						>
							{member}
						</button>
					</div>
					{#if member === detail.founder}
						<span class="socialRowMeta">FOUNDER</span>
					{/if}
				</div>
			{/each}
		</div>

		{#if isMyClan}
			<div class="clanManage">
				<h3 class="socialHeading socialHeadingSpaced">MANAGE</h3>

				{#if st.player.account?.isClanOwner}
					<form class="clanForm" onsubmit={invite}>
						<input class="socialSearch" type="text" placeholder="Invite username" bind:value={inviteName} maxlength="15">
						<button type="submit" class="socialJoin">INVITE</button>
					</form>
					<form class="clanForm" onsubmit={kick}>
						<input class="socialSearch" type="text" placeholder="Kick username" bind:value={kickName} maxlength="15">
						<button type="submit" class="socialJoin">KICK</button>
					</form>
					<form class="clanForm" onsubmit={setChatUrl}>
						<input class="socialSearch" type="text" placeholder="Clan chat URL" bind:value={chatUrl} maxlength="50">
						<button type="submit" class="socialJoin">SAVE</button>
					</form>
					<StatusMessage text={st.messages.clanCht} inline />
				{/if}
				<StatusMessage text={st.messages.clanInv} inline />
				<button type="button" class="socialMore clanLeave" onclick={leaveClan}>
					{st.player.account?.isClanOwner ? "DELETE CLAN" : "LEAVE CLAN"}
				</button>
				<StatusMessage text={st.messages.clanDB} inline />
			</div>
		{/if}
	{/if}
{:else}
	{#if !inAnyClan && st.loggedIn}
		<div class="clanJoinBox">
			<h3 class="socialHeading">START OR JOIN A CLAN</h3>
			<form class="clanForm" onsubmit={createClan}>
				<input class="socialSearch" type="text" placeholder="New clan name (4 chars)" maxlength="4">
				<button type="submit" class="socialJoin">CREATE</button>
			</form>
			<form class="clanForm" onsubmit={joinClan}>
				<input class="socialSearch" type="text" placeholder="Clan name to join" maxlength="4">
				<button type="submit" class="socialJoin">JOIN</button>
			</form>
			<StatusMessage text={st.messages.clanDB} inline />
		</div>
	{:else if !st.loggedIn}
		<div class="socialEmpty">Sign in with Discord from the account menu to create or join a clan.</div>
	{/if}

	<div class="clansControls">
		<input
			class="socialSearch"
			type="text"
			placeholder="SEARCH CLANS"
			bind:value={search}
		>
		<button
			type="button"
			class="socialTab"
			class:socialTabActive={sortBy === "rank"}
			onclick={() => (sortBy = "rank")}
		>
			RANK
		</button>
		<button
			type="button"
			class="socialTab"
			class:socialTabActive={sortBy === "kdr"}
			onclick={() => (sortBy = "kdr")}
		>
			KDR
		</button>
	</div>

	<div class="socialPanel">
		{#if loading}
			<div class="socialEmpty">Loading…</div>
		{:else if filtered.length === 0}
			<div class="socialEmpty">{search.trim() ? "No clans match." : "No clans yet."}</div>
		{:else}
			<div class="socialList">
				{#each filtered as clan, i (clan.name)}
					<div
						class="socialRow socialRowLink"
						animate:flip={{ duration: reduced ? 0 : 260 }}
						in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 220, delay: staggerDelay(i) }}
						out:fade={{ duration: reduced ? 0 : 140 }}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === "Enter" && openClan(clan.name)}
						onclick={() => openClan(clan.name)}
					>
						<span class="clanTag">[{clan.name.toUpperCase()}]</span>
						<div class="socialRowMain">
							<span class="socialRowSub">{clan.numMembers} MEMBER{clan.numMembers === 1 ? "" : "S"}</span>
						</div>
						<span class="socialRowMeta">RNK {clan.rank} · KDR {clan.kdr.toFixed(2)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.clansBack {
		margin-bottom: 10px;
	}
	.clansControls {
		display: flex;
		gap: 6px;
		margin-bottom: 10px;
	}
	.clansControls .socialSearch {
		flex: 1;
		margin-bottom: 0;
	}
	.clansControls .socialTab {
		flex: none;
		min-width: 0;
		padding: 9px 12px;
	}
	.clanHead {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px;
		background: var(--row-inset);
	}
	.clanHeadMain {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.clanName {
		margin: 0;
		font-size: 20px;
		color: var(--ink);
	}
	.clanStats {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}
	.clanStatVal {
		font-size: 18px;
		color: var(--ink);
	}
	.clanChatLink {
		display: inline-block;
		margin-top: 8px;
		font-size: 12px;
		color: var(--blue);
	}
	.clanTag {
		flex: none;
		font-size: 15px;
		color: var(--ink);
	}
	.clanJoinBox {
		margin-bottom: 14px;
		padding: 10px;
		background: var(--row-inset);
	}
	.clanForm {
		display: flex;
		gap: 6px;
		margin: 6px 0;
	}
	.clanForm .socialSearch {
		flex: 1;
		margin-bottom: 0;
	}
	.clanManage {
		margin-top: 14px;
	}
	.clanLeave {
		color: var(--white);
		background: #c0504d;
		box-shadow: inset 0 -3px #a03e3b;
	}
	.clanLeave:hover:not(:disabled) {
		background: #a03e3b;
	}
</style>
