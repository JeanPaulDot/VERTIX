<script lang="ts">
	import { adminApi, confirmAction, type AdminOverview } from "../../adminApi.ts";

	interface Props {
		overview: AdminOverview | null;
		onChanged: () => void;
		onError: (message: string) => void;
	}
	const { overview, onChanged, onError }: Props = $props();

	let broadcastMessage = $state("");

	// NB: no optional parameters in .svelte scripts — this toolchain's TS
	// stripping leaves `param?` in the output as invalid JS.
	async function act(path: string, body: unknown, confirmMsg: string | undefined) {
		if (confirmMsg && !confirmAction(confirmMsg)) return;
		try {
			await adminApi.post(path, body);
			onChanged();
		} catch (err) {
			onError(err instanceof Error ? err.message : "Action failed");
		}
	}

	function sendBroadcast() {
		const message = broadcastMessage.trim();
		if (!message) return;
		act("/server/broadcast", { message }, undefined);
		broadcastMessage = "";
	}

	function toggleMaintenance() {
		const enabled = !overview?.server.maintenance;
		act(
			"/server/maintenance",
			{ enabled },
			enabled
				? "Enable maintenance mode? New joins will be refused (mods/admins can still get in)."
				: "Disable maintenance mode?",
		);
	}

	function setLevel(level: string) {
		act("/server/logLevel", { level }, undefined);
	}
</script>

<section class="adminSection">
	<h3 class="adminSectionTitle">BROADCAST</h3>
	<div class="adminForm">
		<input
			type="text"
			placeholder="Message shown to every player, in every room"
			maxlength="200"
			bind:value={broadcastMessage}
			onkeydown={(e) => e.key === "Enter" && sendBroadcast()}
		>
		<button type="button" class="adminBtn" onclick={sendBroadcast}>SEND</button>
	</div>
</section>

<section class="adminSection">
	<h3 class="adminSectionTitle">MAINTENANCE MODE</h3>
	<p class="adminHintInline">
		While on, new game-room joins are refused with a maintenance message; connected players stay.
		Mods and admins can still join to verify.
	</p>
	<button
		type="button"
		class="adminBtn {overview?.server.maintenance ? '' : 'adminBtnDanger'}"
		onclick={toggleMaintenance}
	>
		{overview?.server.maintenance ? "DISABLE MAINTENANCE" : "ENABLE MAINTENANCE"}
	</button>
</section>

<section class="adminSection">
	<h3 class="adminSectionTitle">LOG LEVEL (currently {overview?.server.logLevel ?? "—"})</h3>
	<p class="adminHintInline">
		Applies immediately, without a restart. debug is very noisy — 9 rooms of bots fighting
		around the clock.
	</p>
	<div class="adminForm">
		{#each ["debug", "info", "warn", "error"] as level (level)}
			<button
				type="button"
				class="adminBtn adminBtnTiny"
				class:adminBtnActive={overview?.server.logLevel === level}
				onclick={() => setLevel(level)}
			>
				{level.toUpperCase()}
			</button>
		{/each}
	</div>
</section>

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
	.adminForm input {
		flex: 1 1 300px;
		padding: 7px 9px;
		font-size: 13px;
		color: var(--ink);
		background: var(--white);
		border: 1px solid var(--card-shadow);
	}
	.adminHintInline {
		margin: 0 0 10px;
		font-size: 11px;
		color: #969696;
	}
</style>
