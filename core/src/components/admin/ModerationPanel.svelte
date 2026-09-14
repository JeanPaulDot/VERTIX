<script lang="ts">
	import { onMount } from "svelte";
	import { adminApi, ask, confirmAction } from "../../adminApi.ts";

	type Sanction = {
		id: number;
		kind: "user" | "ip";
		value: string;
		reason: string;
		issued_by: string;
		issued_at: number;
		expires_at: number | null;
		username: string | null;
	};

	interface Props {
		onError: (message: string) => void;
	}
	const { onError }: Props = $props();

	let bans = $state<Sanction[]>([]);
	let mutes = $state<Sanction[]>([]);
	let loading = $state(true);

	// new-sanction form state (shared between ban and mute forms)
	let newKind = $state<"user" | "ip">("user");
	let newValue = $state("");
	let newReason = $state("");
	let newMinutes = $state("");

	async function load() {
		loading = true;
		try {
			const [b, m] = await Promise.all([
				adminApi.get<Sanction[]>("/bans"),
				adminApi.get<Sanction[]>("/mutes"),
			]);
			bans = b;
			mutes = m;
		} catch (err) {
			onError(err instanceof Error ? err.message : "Could not load sanctions");
		} finally {
			loading = false;
		}
	}

	// NB: no optional parameters in .svelte scripts — this toolchain's TS
	// stripping leaves `param?` in the output as invalid JS.
	async function act(path: string, body: unknown, confirmMsg: string | undefined) {
		if (confirmMsg && !confirmAction(confirmMsg)) return;
		try {
			await adminApi.post(path, body);
			await load();
		} catch (err) {
			onError(err instanceof Error ? err.message : "Action failed");
		}
	}

	function issue(kind: "ban" | "mute") {
		const value = newValue.trim();
		if (!value) {
			onError("Enter a username or IP");
			return;
		}
		const minutes = newMinutes.trim() === "" ? null : Number(newMinutes);
		if (minutes !== null && !Number.isFinite(minutes)) {
			onError("Minutes must be a number or empty");
			return;
		}
		const reason = newReason.trim() || "No reason given";
		act(
			`/moderation/${kind}`,
			{ kind: newKind, value, reason, minutes },
			`${kind === "ban" ? "Ban" : "Mute"} ${newKind} "${value}"?`,
		);
		newValue = "";
		newReason = "";
		newMinutes = "";
	}

	function label(s: Sanction): string {
		if (s.kind === "ip") return s.value;
		return s.username ? `${s.username} (#${s.value})` : `#${s.value}`;
	}

	function expiry(s: Sanction): string {
		return s.expires_at === null ? "permanent" : new Date(s.expires_at).toLocaleString();
	}

	onMount(load);
</script>

<section class="adminSection">
	<h3 class="adminSectionTitle">NEW SANCTION</h3>
	<div class="adminForm">
		<select bind:value={newKind} title="Subject kind">
			<option value="user">user</option>
			<option value="ip">ip</option>
		</select>
		<input type="text" placeholder={newKind === "user" ? "username" : "IP address"} bind:value={newValue}>
		<input type="text" placeholder="reason" bind:value={newReason}>
		<input type="text" placeholder="minutes (empty = permanent)" bind:value={newMinutes}>
		<button type="button" class="adminBtn adminBtnDanger" onclick={() => issue("ban")}>BAN</button>
		<button type="button" class="adminBtn" onclick={() => issue("mute")}>MUTE</button>
	</div>
	<p class="adminHintInline">Bans block joining entirely; mutes block chat only. User bans also force-logout and kick live sessions.</p>
</section>

{#if loading}
	<div class="adminEmpty">Loading…</div>
{:else}
	<section class="adminSection">
		<h3 class="adminSectionTitle">ACTIVE BANS ({bans.length})</h3>
		{#if bans.length === 0}
			<div class="adminEmpty">No active bans.</div>
		{:else}
			<table class="adminTable">
				<tbody>
					<tr><th>Subject</th><th>Reason</th><th>By</th><th>Expires</th><th></th></tr>
					{#each bans as b (b.id)}
					<tr>
						<td>{label(b)} <span class="adminTinyMeta">{b.kind}</span></td>
						<td>{b.reason}</td>
						<td>{b.issued_by}</td>
						<td>{expiry(b)}</td>
						<td>
							<button
								type="button"
								class="adminBtn adminBtnTiny"
								onclick={() => act("/moderation/unban", { kind: b.kind, value: b.kind === "user" ? b.value : b.value }, `Lift the ban on ${label(b)}?`)}
							>
								LIFT
							</button>
						</td>
					</tr>
				{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section class="adminSection">
		<h3 class="adminSectionTitle">ACTIVE MUTES ({mutes.length})</h3>
		{#if mutes.length === 0}
			<div class="adminEmpty">No active mutes.</div>
		{:else}
			<table class="adminTable">
				<tbody>
					<tr><th>Subject</th><th>Reason</th><th>By</th><th>Expires</th><th></th></tr>
					{#each mutes as m (m.id)}
					<tr>
						<td>{label(m)} <span class="adminTinyMeta">{m.kind}</span></td>
						<td>{m.reason}</td>
						<td>{m.issued_by}</td>
						<td>{expiry(m)}</td>
						<td>
							<button
								type="button"
								class="adminBtn adminBtnTiny"
								onclick={() => act("/moderation/unmute", { kind: m.kind, value: m.value }, `Lift the mute on ${label(m)}?`)}
							>
								LIFT
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>
{/if}

<style>
	.adminSection {
		margin-bottom: 14px;
		padding: 12px;
		background: var(--row-inset);
	}
	.adminSectionTitle {
		margin: 0 0 10px;
		font-size: 11px;
		color: #969696;
	}
	.adminForm {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.adminForm select,
	.adminForm input {
		padding: 7px 9px;
		font-size: 13px;
		color: var(--ink);
		background: var(--white);
		border: 1px solid var(--card-shadow);
	}
	.adminForm input:nth-of-type(1) {
		flex: 1 1 140px;
	}
	.adminForm input:nth-of-type(2) {
		flex: 2 1 180px;
	}
	.adminForm input:nth-of-type(3) {
		flex: 1 1 170px;
	}
	.adminHintInline {
		margin: 8px 0 0;
		font-size: 11px;
		color: #969696;
	}
	.adminTinyMeta {
		font-size: 10px;
		color: #969696;
	}
</style>
