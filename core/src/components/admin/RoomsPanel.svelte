<script lang="ts">
	import { adminApi, ask, confirmAction, type AdminOverview, type AdminRoom } from "../../adminApi.ts";
	import { gameModes } from "../../gamemodes.ts";

	interface Props {
		overview: AdminOverview | null;
		onError: (message: string) => void;
	}
	const { overview, onError }: Props = $props();

	let configuring = $state<string | null>(null);
	let configMode = $state(0);
	let configPlayers = $state(8);
	let configPassword = $state("");

	// NB: no optional parameters in .svelte scripts — this toolchain's TS
	// stripping leaves `param?` in the output as invalid JS. `| undefined`
	// with explicit call-site args compiles identically.
	async function act(path: string, body: unknown, confirmMsg: string | undefined) {
		if (confirmMsg && !confirmAction(confirmMsg)) return;
		try {
			await adminApi.post(path, body);
		} catch (err) {
			onError(err instanceof Error ? err.message : "Action failed");
		}
	}

	function kick(room: string, index: number, name: string) {
		act(`/players/${room}/${index}/kick`, undefined, `Kick ${name}?`);
	}

	function ban(room: string, index: number, name: string) {
		const reason = ask(`Ban ${name} — reason?`, "Breaking rules");
		if (reason === null) return;
		const minutes = ask("Minutes (empty = permanent ban)", "60");
		if (minutes === null) return;
		const body = { reason, minutes: minutes === "" ? null : Number(minutes) };
		if (body.minutes !== null && !Number.isFinite(body.minutes)) {
			onError("Minutes must be a number or empty");
			return;
		}
		act(`/players/${room}/${index}/ban`, body, `Ban ${name}?`);
	}

	function mute(room: string, index: number, name: string) {
		const reason = ask(`Mute ${name} — reason?`, "Spam");
		if (reason === null) return;
		const minutes = ask("Minutes (empty = permanent mute)", "30");
		if (minutes === null) return;
		const body = { reason, minutes: minutes === "" ? null : Number(minutes) };
		if (body.minutes !== null && !Number.isFinite(body.minutes)) {
			onError("Minutes must be a number or empty");
			return;
		}
		act(`/players/${room}/${index}/mute`, body, undefined);
	}

	function adjustScore(room: string, index: number, name: string) {
		const delta = ask(`Score delta for ${name} (e.g. -500 or 500)`, "0");
		if (delta === null) return;
		const n = Number(delta);
		if (!Number.isFinite(n)) {
			onError("Delta must be a number");
			return;
		}
		act(`/players/${room}/${index}/score`, { delta: n }, undefined);
	}

	function openConfigure(room: AdminRoom) {
		configuring = configuring === room.name ? null : room.name;
		configMode = gameModes.findIndex((m) => m.code === room.mode);
		if (configMode < 0) configMode = 0;
		configPlayers = room.maxPlayers;
		configPassword = "";
	}

	function applyConfigure(room: string) {
		act(`/rooms/${room}/configure`, {
			srvPlayers: configPlayers,
			srvModes: [configMode],
				srvPass: configPassword,
		}, undefined);
		configuring = null;
	}
</script>

{#if !overview}
	<div class="adminEmpty">Loading rooms…</div>
{:else if overview.rooms.length === 0}
	<div class="adminEmpty">No rooms are open.</div>
{:else}
	{#each overview.rooms as room (room.name)}
		<section class="adminSection">
			<header class="adminRoomHeader">
				<div class="adminRoomTitle">
					<h3 class="adminRoomName">{room.name}</h3>
					<span class="adminRoomMeta">
						{room.modeName} · {room.occupancy}
						{#if !room.permanent}<span class="adminBadge">PRIVATE</span>{/if}
					</span>
				</div>
				<div class="adminRoomActions">
					<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/rooms/${room.name}/restart`, undefined, undefined)}>RESTART</button>
					<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/rooms/${room.name}/bots`, { delta: 1 }, undefined)}>BOT+</button>
					<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/rooms/${room.name}/bots`, { delta: -1 }, undefined)}>BOT-</button>
					<button type="button" class="adminBtn adminBtnTiny" onclick={() => openConfigure(room)}>CONFIG</button>
					<button
						type="button"
						class="adminBtn adminBtnTiny adminBtnDanger"
						onclick={() => act(`/rooms/${room.name}/close`, undefined, `Close ${room.name}? Everyone is disconnected.`)}
					>
						CLOSE
					</button>
				</div>
			</header>

			{#if configuring === room.name}
				<div class="adminConfigRow">
					<label class="adminField">
						<span>MODE</span>
						<select bind:value={configMode}>
							{#each gameModes as mode, i (mode.code)}
								<option value={i}>{mode.name}</option>
							{/each}
						</select>
					</label>
					<label class="adminField">
						<span>MAX PLAYERS</span>
						<input type="number" min="2" max="8" bind:value={configPlayers}>
					</label>
					<label class="adminField">
						<span>PASSWORD (blank = none)</span>
						<input type="text" maxlength="10" bind:value={configPassword}>
					</label>
					<button type="button" class="adminBtn" onclick={() => applyConfigure(room.name)}>APPLY</button>
				</div>
				<p class="adminHintInline">Applying restarts the round with the new settings.</p>
			{/if}

			{#if room.players.length === 0}
				<div class="adminEmpty">Empty.</div>
			{:else}
				<table class="adminTable">
					<tbody>
					<tr><th>Player</th><th>Team</th><th>Score</th><th>K/D</th><th>Session</th><th>IP</th><th>Actions</th></tr>
					{#each room.players as p (room.name + p.name + p.score)}
						<tr class:adminRowBanned={p.banned} class:adminRowMuted={p.muted}>
							<td>
								{p.name}
								{#if !p.human}<span class="adminBadge">BOT</span>{/if}
								{#if p.isBoss}<span class="adminBadge adminBadgeWarn">BOSS</span>{/if}
								{#if p.banned}<span class="adminBadge adminBadgeDanger">BANNED</span>{/if}
								{#if p.muted}<span class="adminBadge adminBadgeWarn">MUTED</span>{/if}
								{#if p.account}<span class="adminTinyMeta">@{p.account}</span>{/if}
							</td>
							<td>{p.team}</td>
							<td>{p.score}</td>
							<td>{p.kills}/{p.deaths}</td>
							<td>{p.sessionFor ?? "—"}</td>
							<td class="adminTinyMeta">{p.ip ?? "—"}</td>
							<td class="adminActionCell">
								{#if p.human}
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => kick(room.name, room.players.indexOf(p), p.name)}>KICK</button>
									<button type="button" class="adminBtn adminBtnTiny adminBtnDanger" onclick={() => ban(room.name, room.players.indexOf(p), p.name)}>BAN</button>
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => mute(room.name, room.players.indexOf(p), p.name)}>MUTE</button>
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/players/${room.name}/${room.players.indexOf(p)}/team`, { team: p.team === "red" ? "blue" : "red" }, undefined)}>TEAM</button>
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/players/${room.name}/${room.players.indexOf(p)}/respawn`, undefined, undefined)}>RESPAWN</button>
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => act(`/players/${room.name}/${room.players.indexOf(p)}/boss`, { value: !p.isBoss }, undefined)}>{p.isBoss ? "-BOSS" : "+BOSS"}</button>
									<button type="button" class="adminBtn adminBtnTiny" onclick={() => adjustScore(room.name, room.players.indexOf(p), p.name)}>SCORE</button>
								{/if}
							</td>
						</tr>
					{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/each}
{/if}

<style>
	.adminSection {
		margin-bottom: 14px;
		padding: 12px;
		background: var(--row-inset);
	}
	.adminRoomHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.adminRoomTitle {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.adminRoomName {
		margin: 0;
		font-size: 16px;
		color: var(--ink);
	}
	.adminRoomMeta {
		font-size: 12px;
		color: #969696;
	}
	.adminRoomActions {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.adminConfigRow {
		display: flex;
		gap: 10px;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}
	.adminField {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 10px;
		color: #969696;
	}
	.adminField select,
	.adminField input {
		padding: 6px 8px;
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
	.adminActionCell {
		white-space: nowrap;
	}
	.adminActionCell .adminBtn {
		margin-right: 3px;
		margin-bottom: 3px;
	}
	.adminTinyMeta {
		font-size: 10px;
		color: #969696;
	}
	.adminRowBanned td {
		opacity: 0.55;
	}
</style>
