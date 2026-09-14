<script lang="ts">
	import { st } from "../../state.svelte.ts";
	import ClansPanel from "./ClansPanel.svelte";
	import FriendsPanel from "./FriendsPanel.svelte";
	import LeaderboardPanel from "./LeaderboardPanel.svelte";
	import ProfilePanel from "./ProfilePanel.svelte";

	type Tab = "profile" | "friends" | "clans" | "leaderboards";

	const tabs: { id: Tab; label: string }[] = [
		{ id: "profile", label: "PROFILE" },
		{ id: "friends", label: "FRIENDS" },
		{ id: "clans", label: "CLANS" },
		{ id: "leaderboards", label: "LEADERBOARDS" },
	];

	function switchTab(tab: Tab) {
		st.socialTab = tab;
		if (tab !== "clans") st.socialClanFocus = null;
	}

	/** Entry points from anywhere in the game: scoreboard rows, friend rows, leaderboard rows. */
	function openProfile(username: string) {
		st.socialProfileUser = username;
		switchTab("profile");
	}

	function openClan(name: string) {
		// leaderboard clan rows show "[TAG]" — the brackets are presentation
		st.socialClanFocus = name.replace(/^\[|\]$/g, "");
		switchTab("clans");
	}
</script>

<div class="socialTabs">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			class="socialTab"
			class:socialTabActive={st.socialTab === tab.id}
			onclick={() => switchTab(tab.id)}
		>
			{tab.label}
			{#if tab.id === "friends" && st.presence.length}
				<span class="socialTabCount">{st.presence.length}</span>
			{/if}
		</button>
	{/each}
</div>

{#if st.socialTab === "profile"}
	<ProfilePanel username={st.socialProfileUser} />
{:else if st.socialTab === "friends"}
	<FriendsPanel onOpenProfile={openProfile} />
{:else if st.socialTab === "clans"}
	<ClansPanel
		focusClan={st.socialClanFocus}
		onClearFocus={() => (st.socialClanFocus = null)}
		onOpenProfile={openProfile}
	/>
{:else}
	<LeaderboardPanel onOpenProfile={openProfile} onOpenClan={openClan} />
{/if}
