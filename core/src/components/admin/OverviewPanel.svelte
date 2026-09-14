<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { adminApi, type AdminOverview } from "../../adminApi.ts";
	import { staggerDelay } from "../../motion.ts";

	type Stats = {
		dau: { day: string; users: number }[];
		modes: { mode: string; sessions: number }[];
		crateSources: { source: string; count: number }[];
		quests: { total: number; claimed: number };
		retention: { eligible: number; retained: number };
		concurrency: { ts: number; humans: number; bots: number; rooms: number }[];
	};

	interface Props {
		overview: AdminOverview | null;
	}
	const { overview }: Props = $props();

	let stats = $state<Stats | null>(null);
	let error = $state("");

	const maxDau = $derived(Math.max(1, ...(stats?.dau.map((d) => d.users) ?? [1])));
	const maxConcurrent = $derived(Math.max(1, ...(stats?.concurrency.map((c) => c.humans) ?? [1])));
	const questPct = $derived(
		stats && stats.quests.total > 0 ? Math.round((stats.quests.claimed / stats.quests.total) * 100) : 0,
	);
	const retentionPct = $derived(
		stats && stats.retention.eligible > 0
			? Math.round((stats.retention.retained / stats.retention.eligible) * 100)
			: 0,
	);

	async function load() {
		try {
			stats = await adminApi.get<Stats>("/stats");
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load stats";
		}
	}
	onMount(load);
</script>

{#if overview}
	<div class="adminKpis">
		{#each [{ label: "PLAYING", value: overview.server.humans }, { label: "IN LOBBY", value: overview.server.lobby }, { label: "ROOMS", value: overview.server.rooms }, { label: "BOTS", value: overview.server.bots }, { label: "DAILY QUESTS CLAIMED", value: `${questPct}%` }, { label: "WEEK-1 RETENTION", value: `${retentionPct}%` }] as kpi, i (kpi.label)}
			<div class="adminKpi" in:fly={{ y: 8, duration: 190, delay: staggerDelay(i) }}>
				<span class="adminKpiValue">{kpi.value}</span>
				<span class="adminKpiLabel">{kpi.label}</span>
			</div>
		{/each}
	</div>
{/if}

{#if error}
	<div class="adminEmpty">{error}</div>
{:else if !stats}
	<div class="adminEmpty">Loading stats…</div>
{:else}
	<div class="adminGrid">
		<section class="adminSection">
			<h3 class="adminSectionTitle">DAILY ACTIVE PLAYERS (14 DAYS)</h3>
			<div class="adminBars">
				{#each stats.dau as day (day.day)}
					<div
						class="adminBarCol"
						title="{day.day}: {day.users} players"
					>
						<div class="adminBar" style="height: {Math.max(3, (day.users / maxDau) * 100)}%"></div>
						<span class="adminBarLabel">{day.day.slice(5)}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="adminSection">
			<h3 class="adminSectionTitle">CONCURRENCY (LAST 6H)</h3>
			<div class="adminBars">
				{#each stats.concurrency as point (point.ts)}
					<div class="adminBarCol" title="{new Date(point.ts).toLocaleTimeString()}: {point.humans} playing">
						<div class="adminBar adminBarLive" style="height: {Math.max(3, (point.humans / maxConcurrent) * 100)}%"></div>
					</div>
				{/each}
			</div>
		</section>

		<section class="adminSection">
			<h3 class="adminSectionTitle">MODE POPULARITY</h3>
			{#if stats.modes.length === 0}
				<div class="adminEmpty">No sessions recorded yet.</div>
			{:else}
				<table class="adminTable">
					<tbody>
						<tr><th>Mode</th><th>Sessions</th></tr>
						{#each stats.modes as m (m.mode)}
							<tr><td>{m.mode}</td><td>{m.sessions}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section class="adminSection">
			<h3 class="adminSectionTitle">CRATE SOURCES</h3>
			{#if stats.crateSources.length === 0}
				<div class="adminEmpty">No crates granted yet.</div>
			{:else}
				<table class="adminTable">
					<tbody>
						<tr><th>Source</th><th>Crates</th></tr>
						{#each stats.crateSources as s (s.source)}
							<tr><td>{s.source}</td><td>{s.count}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	</div>

	{#if overview && overview.lobby.length > 0}
		<section class="adminSection">
			<h3 class="adminSectionTitle">IN LOBBY (MENU, NOT IN A ROOM)</h3>
			<table class="adminTable">
				<tbody>
					<tr><th>User</th><th>IP</th><th>For</th></tr>
					{#each overview.lobby as l (l.username + l.ip)}
						<tr><td>{l.username}</td><td>{l.ip}</td><td>{l.connectedFor}</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
{/if}

<style>
	.adminKpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 8px;
		margin-bottom: 16px;
	}
	.adminKpi {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 12px 8px;
		background: var(--row-inset);
	}
	.adminKpiValue {
		font-size: 22px;
		color: var(--ink);
	}
	.adminKpiLabel {
		font-size: 10px;
		color: #969696;
	}
	.adminGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	@media (max-width: 800px) {
		.adminGrid {
			grid-template-columns: 1fr;
		}
	}
	.adminSection {
		padding: 12px;
		background: var(--row-inset);
	}
	.adminSectionTitle {
		margin: 0 0 10px;
		font-size: 11px;
		color: #969696;
	}
	.adminBars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 90px;
	}
	.adminBarCol {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		height: 100%;
		min-width: 0;
	}
	.adminBar {
		width: 100%;
		background: var(--setting-blue);
		min-height: 3px;
	}
	.adminBarLive {
		background: #4caf50;
	}
	.adminBarLabel {
		font-size: 8px;
		color: #969696;
		text-align: center;
		overflow: hidden;
		white-space: nowrap;
	}
</style>
