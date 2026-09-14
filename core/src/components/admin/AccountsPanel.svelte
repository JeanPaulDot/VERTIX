<script lang="ts">
	import { onMount } from "svelte";
	import { adminApi, ask, confirmAction } from "../../adminApi.ts";

	type AdminUser = {
		id: number;
		username: string;
		discord_username: string;
		role: "player" | "mod" | "admin";
		created_at: string;
		score: number;
		kills: number;
		deaths: number;
		first_seen: number;
		last_seen: number;
		session_count: number;
		play_time_seconds: number;
		last_ip: string;
	};

	type Sanction = {
		reason: string;
		issued_by: string;
		issued_at: number;
		expires_at: number | null;
	} | null;

	type UserDetail = {
		user: AdminUser;
		sessions: { room: string; ip: string; started_at: number; duration_seconds: number }[];
		ips: { ip: string; first_seen: number; last_seen: number; count: number }[];
		ban: Sanction;
		mute: Sanction;
	};

	interface Props {
		onError: (message: string) => void;
	}
	const { onError }: Props = $props();

	let search = $state("");
	let users = $state<AdminUser[]>([]);
	let total = $state(0);
	let page = $state(1);
	let loading = $state(true);
	let detail = $state<UserDetail | null>(null);
	let detailLoading = $state(false);

	async function load() {
		loading = true;
		try {
			const params = new URLSearchParams({ page: String(page), limit: "50" });
			if (search.trim()) params.set("q", search.trim());
			const data = await adminApi.get<{ users: AdminUser[]; total: number }>(`/users?${params}`);
			users = data.users;
			total = data.total;
		} catch (err) {
			onError(err instanceof Error ? err.message : "Could not load users");
		} finally {
			loading = false;
		}
	}

	async function openUser(id: number) {
		detailLoading = true;
		detail = null;
		try {
			detail = await adminApi.get<UserDetail>(`/users/${id}`);
		} catch (err) {
			onError(err instanceof Error ? err.message : "Could not load user");
		} finally {
			detailLoading = false;
		}
	}

	// NB: no optional parameters in .svelte scripts — this toolchain's TS
	// stripping leaves `param?` in the output as invalid JS.
	async function act(path: string, body: unknown, confirmMsg: string | undefined) {
		if (confirmMsg && !confirmAction(confirmMsg)) return;
		try {
			await adminApi.post(path, body);
			// refresh the detail so ban/mute badges update immediately
			if (detail) await openUser(detail.user.id);
		} catch (err) {
			onError(err instanceof Error ? err.message : "Action failed");
		}
	}

	function banAccount(id: number, name: string) {
		const reason = ask(`Ban ${name} — reason?`, "Breaking rules");
		if (reason === null) return;
		const minutes = ask("Minutes (empty = permanent)", "60");
		if (minutes === null) return;
		const n = minutes === "" ? null : Number(minutes);
		if (n !== null && !Number.isFinite(n)) {
			onError("Minutes must be a number or empty");
			return;
		}
		act(`/accounts/${id}/ban`, { reason, minutes: n }, `Ban ${name}?`);
	}

	function muteAccount(id: number, name: string) {
		const reason = ask(`Mute ${name} — reason?`, "Spam");
		if (reason === null) return;
		const minutes = ask("Minutes (empty = permanent)", "30");
		if (minutes === null) return;
		const n = minutes === "" ? null : Number(minutes);
		if (n !== null && !Number.isFinite(n)) {
			onError("Minutes must be a number or empty");
			return;
		}
		act(`/accounts/${id}/mute`, { reason, minutes: n }, undefined);
	}

	function rename(id: number, current: string) {
		const username = ask(`Rename ${current} to:`, current);
		if (username === null || username === current) return;
		act(`/accounts/${id}/rename`, { username }, undefined);
	}

	function setScore(id: number, current: number) {
		const score = ask(`Set lifetime score (currently ${current}):`, String(current));
		if (score === null) return;
		const n = Number(score);
		if (!Number.isFinite(n) || n < 0) {
			onError("Score must be a non-negative number");
			return;
		}
		act(`/accounts/${id}/score`, { score: n }, undefined);
	}

	function setRole(id: number, role: string) {
		act(`/accounts/${id}/role`, { role }, `Set role to ${role}?`);
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			page = 1;
			load();
		}, 250);
	}

	onMount(load);
</script>

<input
	class="socialSearch"
	type="text"
	placeholder="SEARCH ACCOUNTS"
	bind:value={search}
	oninput={onSearchInput}
/>

{#if loading}
	<div class="adminEmpty">Loading…</div>
{:else}
	<table class="adminTable">
		<tbody>
			<tr><th>User</th><th>Role</th><th>Score</th><th>K/D</th><th>Sessions</th><th>Last seen</th><th>Last IP</th></tr>
			{#each users as user (user.id)}
			<tr class="adminRowLink" onclick={() => openUser(user.id)} role="button" tabindex="0"
				onkeydown={(e) => e.key === "Enter" && openUser(user.id)}>
				<td>{user.username}</td>
				<td>{user.role}</td>
				<td>{user.score.toLocaleString()}</td>
				<td>{user.kills}/{user.deaths}</td>
				<td>{user.session_count}</td>
				<td>{user.last_seen ? new Date(user.last_seen).toLocaleString() : "—"}</td>
				<td class="adminTinyMeta">{user.last_ip || "—"}</td>
			</tr>
		{:else}
			<tr><td colspan="7" class="adminEmpty">No accounts match.</td></tr>
		{/each}
	</tbody>
</table>
	<div class="adminPager">
		<button type="button" class="adminBtn adminBtnTiny" disabled={page <= 1} onclick={() => { page--; load(); }}>PREV</button>
		<span class="adminTinyMeta">Page {page} · {total} accounts</span>
		<button type="button" class="adminBtn adminBtnTiny" disabled={page * 50 >= total} onclick={() => { page++; load(); }}>NEXT</button>
	</div>
{/if}

{#if detailLoading}
	<div class="adminEmpty">Loading account…</div>
{:else if detail}
	{@const u = detail.user}
	<section class="adminSection">
		<header class="adminDetailHeader">
			<h3 class="adminDetailName">
				{u.username}
				{#if detail.ban}<span class="adminBadge adminBadgeDanger">BANNED</span>{/if}
				{#if detail.mute}<span class="adminBadge adminBadgeWarn">MUTED</span>{/if}
			</h3>
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => (detail = null)}>CLOSE</button>
		</header>

		<div class="adminDetailMeta">
			<span>#{u.id}</span>
			<span>role: {u.role}</span>
			<span>discord: {u.discord_username || "—"}</span>
			<span>created: {u.created_at}</span>
			<span>score: {u.score.toLocaleString()}</span>
			<span>K/D: {u.kills}/{u.deaths}</span>
			<span>play time: {Math.floor(u.play_time_seconds / 3600)}h</span>
		</div>

		{#if detail.ban}
			<p class="adminSanctionNote">Banned by {detail.ban.issued_by}: {detail.ban.reason}</p>
		{/if}
		{#if detail.mute}
			<p class="adminSanctionNote">Muted by {detail.mute.issued_by}: {detail.mute.reason}</p>
		{/if}

		<div class="adminActionRow">
			<button type="button" class="adminBtn adminBtnTiny adminBtnDanger" onclick={() => banAccount(u.id, u.username)}>BAN</button>
			{#if detail.ban}
				<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/accounts/${u.id}/unban`, undefined, undefined)}>UNBAN</button>
			{/if}
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => muteAccount(u.id, u.username)}>MUTE</button>
			{#if detail.mute}
				<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/accounts/${u.id}/unmute`, undefined, undefined)}>UNMUTE</button>
			{/if}
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => rename(u.id, u.username)}>RENAME</button>
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => setScore(u.id, u.score)}>SET SCORE</button>
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/accounts/${u.id}/crate`, { count: 1 }, undefined)}>+CRATE</button>
			<button type="button" class="adminBtn adminBtnTiny adminBtnDanger" onclick={() => act(`/accounts/${u.id}/resetStats`, undefined, `Reset ALL stats for ${u.username}?`)}>RESET STATS</button>
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/accounts/${u.id}/forceLogout`, undefined, `Force ${u.username} to log out?`)}>FORCE LOGOUT</button>
			<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/accounts/${u.id}/clan/remove`, undefined, `Remove ${u.username} from their clan?`)}>REMOVE FROM CLAN</button>
			<select class="adminRoleSelect" value={u.role} onchange={(e) => setRole(u.id, (e.target as HTMLSelectElement).value)}>
				<option value="player">player</option>
				<option value="mod">mod</option>
				<option value="admin">admin</option>
			</select>
		</div>

		<div class="adminDetailGrid">
			<div>
				<h4 class="adminSubTitle">RECENT SESSIONS</h4>
				{#if detail.sessions.length === 0}
					<div class="adminEmpty">No sessions.</div>
				{:else}
					<table class="adminTable">
						<tbody>
							<tr><th>Room</th><th>IP</th><th>When</th><th>Duration</th></tr>
							{#each detail.sessions.slice(0, 15) as s (s.started_at)}
								<tr><td>{s.room}</td><td class="adminTinyMeta">{s.ip}</td><td>{new Date(s.started_at).toLocaleString()}</td><td>{Math.floor(s.duration_seconds / 60)}m</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
			<div>
				<h4 class="adminSubTitle">KNOWN IPS</h4>
				{#if detail.ips.length === 0}
					<div class="adminEmpty">No IPs recorded.</div>
				{:else}
					<table class="adminTable">
						<tbody>
							<tr><th>IP</th><th>Seen</th><th>Last</th></tr>
							{#each detail.ips.slice(0, 15) as i (i.ip)}
								<tr><td>{i.ip}</td><td>{i.count}×</td><td>{new Date(i.last_seen).toLocaleDateString()}</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</section>
{/if}

<style>
	.adminPager {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 10px 0 16px;
	}
	.adminRowLink {
		cursor: pointer;
	}
	.adminRowLink:hover td {
		background: var(--row-hover);
	}
	.adminSection {
		margin-top: 8px;
		padding: 12px;
		background: var(--row-inset);
	}
	.adminDetailHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.adminDetailName {
		margin: 0;
		font-size: 17px;
		color: var(--ink);
	}
	.adminDetailMeta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 12px;
		color: #969696;
		margin-bottom: 10px;
	}
	.adminSanctionNote {
		margin: 0 0 10px;
		font-size: 12px;
		color: #e06363;
	}
	.adminActionRow {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
		margin-bottom: 14px;
	}
	.adminRoleSelect {
		padding: 4px 6px;
		font-size: 12px;
		background: var(--white);
		color: var(--ink);
		border: 1px solid var(--card-shadow);
	}
	.adminDetailGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	@media (max-width: 800px) {
		.adminDetailGrid {
			grid-template-columns: 1fr;
		}
	}
	.adminSubTitle {
		margin: 0 0 8px;
		font-size: 11px;
		color: #969696;
	}
	.adminTinyMeta {
		font-size: 10px;
		color: #969696;
	}
</style>
