<script lang="ts">
	import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import {
		adminApi,
		getAdminToken,
		setAdminToken,
		clearAdminToken,
		ApiError,
		type AdminOverview,
	} from "../../adminApi.ts";
	import { prefersReducedMotion } from "../../motion.ts";
	import OverviewPanel from "./OverviewPanel.svelte";
	import RoomsPanel from "./RoomsPanel.svelte";
	import AccountsPanel from "./AccountsPanel.svelte";
	import ModerationPanel from "./ModerationPanel.svelte";
	import ReportsPanel from "./ReportsPanel.svelte";
	import AuditPanel from "./AuditPanel.svelte";
	import ServerPanel from "./ServerPanel.svelte";

	type Tab = "overview" | "rooms" | "accounts" | "moderation" | "reports" | "audit" | "server";

	type Overview = AdminOverview;

	const tabs: { id: Tab; label: string }[] = [
		{ id: "overview", label: "OVERVIEW" },
		{ id: "rooms", label: "ROOMS" },
		{ id: "accounts", label: "ACCOUNTS" },
		{ id: "moderation", label: "BANS & MUTES" },
		{ id: "reports", label: "REPORTS" },
		{ id: "audit", label: "AUDIT" },
		{ id: "server", label: "SERVER" },
	];

	// null = still probing (token or session may already be valid)
	let authed = $state<boolean | null>(null);
	let tokenInput = $state("");
	let authError = $state("");
	let tab = $state<Tab>("overview");
	let overview = $state<Overview | null>(null);
	let actionError = $state("");

	const reduced = $derived(prefersReducedMotion());

	async function probe() {
		try {
			overview = await adminApi.get<Overview>("/overview");
			authed = true;
			authError = "";
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				authed = false;
			} else {
				authed = false;
				authError = err instanceof Error ? err.message : "Could not reach the server";
			}
		}
	}

	function unlock() {
		setAdminToken(tokenInput.trim());
		probe();
	}

	function lock() {
		clearAdminToken();
		tokenInput = "";
		authed = false;
	}

	onMount(() => {
		tokenInput = getAdminToken();
		probe();
		// keep the live views fresh; every panel that needs its own data fetches
		// on mount, so this poll only has to refresh the shared overview
		const timer = setInterval(() => {
			if (authed) probe();
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

<div class="adminShell">
	<header class="adminHeader">
		<h1>VERTIX <span class="adminHeaderDim">ADMIN</span></h1>
		{#if authed}
			<div class="adminHeaderRight">
				{#if overview}
					<span class="adminHeaderMeta">
						{overview.server.humans} playing · {overview.server.rooms} rooms
						{#if overview.server.maintenance}<span class="adminBadge adminBadgeWarn">MAINTENANCE</span>{/if}
					</span>
				{/if}
				<button type="button" class="adminBtn adminBtnSecondary" onclick={lock}>LOCK</button>
			</div>
		{/if}
	</header>

	{#if authed === null}
		<div class="adminEmpty">Checking access…</div>
	{:else if !authed}
		<div class="adminCard" in:fade={{ duration: reduced ? 0 : 190 }}>
			<h2 class="adminHeading">Unlock</h2>
			<p class="adminHint">
				Paste the ADMIN_TOKEN, or open this page while signed in with a mod/admin account.
			</p>
			<div class="adminUnlockRow">
				<input
					type="password"
					class="adminInput"
					placeholder="ADMIN_TOKEN"
					autocomplete="off"
					bind:value={tokenInput}
					onkeydown={(e) => e.key === "Enter" && unlock()}
				/>
				<button type="button" class="adminBtn" onclick={unlock}>UNLOCK</button>
			</div>
			{#if authError}<p class="adminError">{authError}</p>{/if}
		</div>
	{:else}
		<nav class="socialTabs adminTabs">
			{#each tabs as t (t.id)}
				<button
					type="button"
					class="socialTab"
					class:socialTabActive={tab === t.id}
					onclick={() => (tab = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</nav>

		{#if actionError}
			<div class="adminErrorBar">
				{actionError}
				<button type="button" class="adminBtn adminBtnTiny" onclick={() => (actionError = "")}>DISMISS</button>
			</div>
		{/if}

		{#if tab === "overview"}
			<OverviewPanel {overview} />
		{:else if tab === "rooms"}
			<RoomsPanel {overview} onError={(m) => (actionError = m)} />
		{:else if tab === "accounts"}
			<AccountsPanel onError={(m) => (actionError = m)} />
		{:else if tab === "moderation"}
			<ModerationPanel onError={(m) => (actionError = m)} />
		{:else if tab === "reports"}
			<ReportsPanel onError={(m) => (actionError = m)} />
		{:else if tab === "audit"}
			<AuditPanel />
		{:else}
			<ServerPanel {overview} onChanged={probe} onError={(m) => (actionError = m)} />
		{/if}
	{/if}
</div>

<style>
	.adminShell {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px 16px 48px;
	}
	.adminHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}
	.adminHeader h1 {
		margin: 0;
		font-size: 22px;
		color: var(--ink);
	}
	.adminHeaderDim {
		color: #969696;
	}
	.adminHeaderRight {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.adminHeaderMeta {
		font-size: 12px;
		color: #969696;
	}
	.adminTabs {
		margin-bottom: 14px;
	}
	.adminCard {
		max-width: 460px;
		margin: 48px auto 0;
		padding: 18px;
		background: var(--row-inset);
	}
	.adminHeading {
		margin: 0 0 6px;
		font-size: 15px;
		color: var(--ink);
	}
	.adminHint {
		margin: 0 0 12px;
		font-size: 12px;
		color: #969696;
	}
	.adminUnlockRow {
		display: flex;
		gap: 8px;
	}
	.adminError {
		margin: 10px 0 0;
		font-size: 12px;
		color: #e06363;
	}
	.adminErrorBar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 12px;
		padding: 8px 12px;
		font-size: 13px;
		color: #e06363;
		background: rgba(224, 99, 99, 0.12);
		border: 1px solid rgba(224, 99, 99, 0.4);
	}
</style>
