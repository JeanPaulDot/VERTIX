<script lang="ts">
	import { onMount } from "svelte";
	import { adminApi } from "../../adminApi.ts";

	type AuditEntry = {
		id: number;
		actor: string;
		action: string;
		target: string;
		payload: string | null;
		ip: string;
		created_at: number;
	};

	let entries = $state<AuditEntry[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(true);
	let error = $state("");

	async function load() {
		loading = true;
		try {
			const data = await adminApi.get<{ entries: AuditEntry[]; total: number }>(
				`/audit?page=${page}&limit=50`,
			);
			entries = data.entries;
			total = data.total;
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load audit log";
		} finally {
			loading = false;
		}
	}

	function prettyPayload(payload: string | null): string {
		if (!payload) return "";
		try {
			return JSON.stringify(JSON.parse(payload));
		} catch {
			return payload;
		}
	}

	onMount(load);
</script>

{#if error}
	<div class="adminEmpty">{error}</div>
{:else if loading}
	<div class="adminEmpty">Loading…</div>
{:else if entries.length === 0}
	<div class="adminEmpty">No admin actions recorded yet.</div>
{:else}
	<table class="adminTable">
		<tbody>
			<tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Payload</th><th>IP</th></tr>
			{#each entries as e (e.id)}
			<tr>
				<td>{new Date(e.created_at).toLocaleString()}</td>
				<td>{e.actor}</td>
				<td><span class="adminBadge">{e.action}</span></td>
				<td>{e.target}</td>
				<td class="adminTinyMeta">{prettyPayload(e.payload)}</td>
				<td class="adminTinyMeta">{e.ip}</td>
			</tr>
		{/each}
		</tbody>
	</table>
	<div class="adminPager">
		<button type="button" class="adminBtn adminBtnTiny" disabled={page <= 1} onclick={() => { page--; load(); }}>PREV</button>
		<span class="adminTinyMeta">Page {page} · {total} entries</span>
		<button type="button" class="adminBtn adminBtnTiny" disabled={page * 50 >= total} onclick={() => { page++; load(); }}>NEXT</button>
	</div>
{/if}

<style>
	.adminPager {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
	}
	.adminTinyMeta {
		font-size: 10px;
		color: #969696;
	}
</style>
