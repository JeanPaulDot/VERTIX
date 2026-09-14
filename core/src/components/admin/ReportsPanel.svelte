<script lang="ts">
	import { onMount } from "svelte";
	import { adminApi, confirmAction } from "../../adminApi.ts";

	type BugReport = {
		id: number;
		message: string;
		username: string;
		room: string;
		mode: string;
		user_agent: string;
		ip: string;
		created_at: string;
		status?: string;
	};

	interface Props {
		onError: (message: string) => void;
	}
	const { onError }: Props = $props();

	let reports = $state<BugReport[]>([]);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			reports = await adminApi.get<BugReport[]>("/bugReports");
		} catch (err) {
			onError(err instanceof Error ? err.message : "Could not load reports");
		} finally {
			loading = false;
		}
	}

	async function resolve(id: number) {
		if (!confirmAction("Mark this report as resolved?")) return;
		try {
			await adminApi.post(`/bugReports/${id}/resolve`);
			await load();
		} catch (err) {
			onError(err instanceof Error ? err.message : "Could not resolve");
		}
	}

	onMount(load);
</script>

{#if loading}
	<div class="adminEmpty">Loading…</div>
{:else if reports.length === 0}
	<div class="adminEmpty">No bug reports.</div>
{:else}
	<table class="adminTable">
		<tbody>
			<tr><th>When</th><th>User</th><th>Room</th><th>Report</th><th>Status</th><th></th></tr>
			{#each reports as r (r.id)}
			<tr class:adminRowDone={r.status === "resolved"}>
				<td>{r.created_at}</td>
				<td>{r.username || "(guest)"}</td>
				<td>{r.room || "—"} <span class="adminTinyMeta">{r.mode || ""}</span></td>
				<td class="adminReportCell">
					{r.message}
					<span class="adminTinyMeta">{r.ip} · {r.user_agent}</span>
				</td>
				<td>
					{#if r.status === "resolved"}
						<span class="adminBadge">RESOLVED</span>
					{:else}
						<span class="adminBadge adminBadgeWarn">OPEN</span>
					{/if}
				</td>
				<td>
					{#if r.status !== "resolved"}
						<button type="button" class="adminBtn adminBtnTiny" onclick={() => resolve(r.id)}>RESOLVE</button>
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>
{/if}

<style>
	.adminReportCell {
		max-width: 380px;
	}
	.adminTinyMeta {
		display: block;
		font-size: 10px;
		color: #969696;
	}
	.adminRowDone td {
		opacity: 0.55;
	}
</style>
