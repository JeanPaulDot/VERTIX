<script lang="ts">
	import { onMount } from "svelte";
	import { flip } from "svelte/animate";
	import { fade, fly } from "svelte/transition";
	import {
		emptyLeaderboardUIData,
		fetchLeaderboards,
		LB_TYPES_FRIENDLY_NAMES,
		type LeaderboardRow,
		type LeaderboardUIData,
	} from "../../leaderboardData.ts";
	import type { LeaderboardType } from "../../types.ts";
	import { prefersReducedMotion, staggerDelay } from "../../motion.ts";

	interface Props {
		onOpenProfile: (username: string) => void;
		onOpenClan: (clan: string) => void;
	}
	const { onOpenProfile, onOpenClan }: Props = $props();

	let selected: LeaderboardType = $state("rank");
	let data: LeaderboardUIData = $state(emptyLeaderboardUIData());
	let loading = $state(true);
	let error = $state("");

	/**
	 * Previous positions by row key, so a refresh can tell which rows moved. A
	 * flat re-render shows nothing; a diff lets the row flash and flip into
	 * place, which is the whole point of pulling structured rows out of
	 * leaderboardData instead of pre-formatted strings.
	 */
	const lastPositions = new Map<string, number>();

	const rows = $derived<LeaderboardRow[]>(data[selected]);
	const reduced = $derived(prefersReducedMotion());

	// which rows moved since the last render of this board — drives the flash
	const movedRows = $derived.by(() => {
		const moved = new Set<string>();
		for (const row of rows) {
			const prev = lastPositions.get(row.key);
			if (prev !== undefined && prev !== row.position) moved.add(row.key);
		}
		return moved;
	});

	async function load() {
		loading = true;
		error = "";
		try {
			const fresh = await fetchLeaderboards();
			// record positions before swapping, so the next diff has a baseline
			for (const [type, list] of Object.entries(fresh)) {
				for (const row of list) lastPositions.set(row.key, row.position);
				if (type === selected) {
					// seed the baseline for the incoming board too
				}
			}
			data = fresh;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load leaderboards";
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<div class="socialTabs">
	{#each Object.entries(LB_TYPES_FRIENDLY_NAMES) as [type, friendly] (type)}
		<button
			type="button"
			class="socialTab"
			class:socialTabActive={selected === type}
			onclick={() => (selected = type as LeaderboardType)}
		>
			{friendly}
		</button>
	{/each}
</div>

<div class="socialPanel">
	{#if loading}
		<div class="socialEmpty">Loading…</div>
	{:else if error}
		<div class="socialEmpty">{error}</div>
		<button type="button" class="socialMore" onclick={load}>RETRY</button>
	{:else if rows.length === 0}
		<div class="socialEmpty">Nothing on this board yet.</div>
	{:else}
		<div class="socialList">
			{#each rows as row, i (row.key)}
				<div
					class="socialRow"
					class:socialRowChanged={movedRows.has(row.key)}
					animate:flip={{ duration: reduced ? 0 : 260 }}
					in:fly={{ y: reduced ? 0 : 10, duration: reduced ? 0 : 220, delay: staggerDelay(i) }}
					out:fade={{ duration: reduced ? 0 : 140 }}
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === "Enter") row.isClan ? onOpenClan(row.name) : onOpenProfile(row.name);
					}}
					onclick={() => (row.isClan ? onOpenClan(row.name) : onOpenProfile(row.name))}
				>
					<span
						class="lbPosition"
						class:lbPositionTop={row.position <= 3}
					>
						{row.position}
					</span>
					<div class="socialRowMain">
						<span class="socialRowName">{row.name}</span>
						{#if row.subtitle}<span class="socialRowSub">{row.subtitle}</span>{/if}
					</div>
					<div class="lbMetric">
						<span class="lbMetricValue">{row.metric}</span>
						<span class="socialRowSub">{row.metricLabel}</span>
					</div>
					<span class="socialRowMeta">{row.detail}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.lbPosition {
		flex: none;
		width: 30px;
		text-align: center;
		font-size: 16px;
		color: #969696;
	}
	.lbPositionTop {
		color: var(--blue);
		font-weight: bold;
	}
	.lbMetric {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}
	.lbMetricValue {
		font-size: 17px;
		color: var(--ink);
	}
</style>
