<script lang="ts">
	import { onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { st } from "../../state.svelte.ts";
	import { getCosmeticImageUrl, getItemRarityColor, getItemRarityTier } from "../../utils.ts";
	import { prefersReducedMotion, staggerDelay } from "../../motion.ts";

	type UnlockedItem = { type: "hat" | "shirt" | "camo"; name: string; chance: number; id?: number };
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

	interface Props {
		/** whose profile to load; the hub resolves the default before passing it down */
		username: string | null;
	}
	const { username }: Props = $props();

	let profile: ProfileData | null = $state(null);
	let loading = $state(true);
	let error = $state("");

	// fallback for null: own account, then the typed name (guest self-view)
	const target = $derived(username || st.player.account?.username || st.playerName);

	function abbreviate(value: number) {
		if (value < 1000) return String(value);
		const suffixes = ["", "k", "m", "b", "t"];
		const index = Math.floor(Math.log10(value) / 3);
		return `${parseFloat((value / 1000 ** index).toPrecision(2))}${suffixes[index]}`;
	}

	async function load(name: string) {
		loading = true;
		error = "";
		profile = null;
		try {
			const res = await fetch(`/api/profile/${encodeURIComponent(name)}`);
			if (!res.ok) {
				error = res.status === 404 ? "Player not found." : "Failed to load profile.";
				return;
			}
			profile = await res.json();
		} catch {
			error = "Connection failed. Try again later.";
		} finally {
			loading = false;
		}
	}

	// re-fetch when the hub switches the profile target (friend row → another player)
	$effect(() => {
		target;
		if (target) load(target);
	});

	// the canonical rarity helpers drive colour AND the reveal intensity ladder,
	// so this panel and the crate popup agree on what a rarity looks like
	const rarityColor = (chance: number) => getItemRarityColor(chance);
	const rarityLabel = (chance: number) =>
		["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"][getItemRarityTier(chance)];

	const reduced = $derived(prefersReducedMotion());

	// unlock showcase image: the API row carries no id for old unlocks, so the
	// image only renders when the server sent one — the name stays either way
	function unlockImage(u: UnlockedItem): string | null {
		return u.id != null ? getCosmeticImageUrl(u.type, u.id) : null;
	}
</script>

{#if loading}
	<div class="socialEmpty">Loading…</div>
{:else if error}
	<div class="socialEmpty">{error}</div>
{:else if profile}
	<div class="profileHead" in:fade={{ duration: reduced ? 0 : 190 }}>
		{#if profile.avatar}
			<img class="profileAvatar" src={profile.avatar} alt="" width="72" height="72">
		{/if}
		<div class="profileHeadMain">
			<h2 class="profileName">{profile.name}</h2>
			<span class="profileClan">
				{#if profile.clan}[{profile.clan.toUpperCase()}]{:else}NO CLAN{/if}
			</span>
		</div>
	</div>

	<div class="profileStats">
		{#each [{ label: "WORLD", value: `#${profile.worldRank}` }, { label: "RANK", value: profile.rank }, { label: "KDR", value: profile.kdr.toFixed(2) }, { label: "KILLS", value: abbreviate(profile.kills) }, { label: "DEATHS", value: abbreviate(profile.deaths) }, { label: "SCORE", value: abbreviate(profile.score) }, { label: "HATS", value: profile.numHats }, { label: "LIKES", value: abbreviate(profile.likes) }] as stat, i (stat.label)}
			<div
				class="profileStatCell"
				style="--rarity: {rarityColor(100)}"
				in:fly={{ y: reduced ? 0 : 8, duration: reduced ? 0 : 190, delay: staggerDelay(i) }}
			>
				<span class="profileStatValue">{stat.value}</span>
				<span class="profileStatLabel">{stat.label}</span>
			</div>
		{/each}
	</div>

	<h3 class="socialHeading socialHeadingSpaced">
		ACHIEVEMENTS
		{#if profile.unlocks.length}<span class="socialTabCount">{profile.unlocks.length}</span>{/if}
	</h3>

	{#if profile.unlocks.length === 0}
		<div class="socialEmpty">Nothing unlocked yet.</div>
	{:else}
		<div class="profileUnlocks">
			{#each profile.unlocks as unlock, i (unlock.type + unlock.name)}
				{@const color = rarityColor(unlock.chance)}
				{@const tier = getItemRarityTier(unlock.chance)}
				{@const img = unlockImage(unlock)}
				<div
					class="profileUnlock reveal-tier{tier}"
					style="--rarity: {color}"
					title="{unlock.name} · {rarityLabel(unlock.chance)} {unlock.type}"
					in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 220, delay: staggerDelay(i, 12) }}
				>
					{#if img}
						<img class="profileUnlockImg" src={img} alt="" loading="lazy">
					{:else}
						<span class="profileUnlockImg profileUnlockPlaceholder" aria-hidden="true"></span>
					{/if}
					<span class="profileUnlockName">{unlock.name}</span>
					<span class="profileUnlockRarity">{rarityLabel(unlock.chance)}</span>
				</div>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.profileHead {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px;
		background: var(--row-inset);
	}
	.profileAvatar {
		width: 72px;
		height: 72px;
		border-radius: 2px;
		object-fit: cover;
	}
	.profileHeadMain {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.profileName {
		margin: 0;
		font-size: 24px;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.profileClan {
		font-size: 12px;
		color: #969696;
	}
	.profileStats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		margin-top: 10px;
	}
	@media (max-width: 600px) {
		.profileStats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.profileStatCell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 8px 4px;
		background: var(--row-inset);
		border-radius: 1px;
	}
	.profileStatValue {
		font-size: 20px;
		color: var(--ink);
	}
	.profileStatLabel {
		font-size: 10px;
		color: #969696;
	}
	.profileUnlocks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 6px;
	}
	/* the crate reveal ladder, keyed by the canonical tier so the colours and
	   intensities match the crate popup exactly */
	.profileUnlock {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 6px;
		background: var(--row-inset);
		border-radius: 1px;
		border: 2px solid transparent;
	}
	.profileUnlock.reveal-tier3,
	.profileUnlock.reveal-tier4 {
		border-color: var(--rarity);
	}
	.profileUnlock.reveal-tier4 {
		box-shadow: 0 0 10px color-mix(in srgb, var(--rarity) 45%, transparent);
	}
	.profileUnlockImg {
		width: 42px;
		height: 42px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.profileUnlockPlaceholder {
		background: var(--card-shadow);
	}
	.profileUnlockName {
		font-size: 11px;
		color: var(--ink);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.profileUnlockRarity {
		font-size: 9px;
		color: var(--rarity);
	}
</style>
