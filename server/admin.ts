import { Hono, type Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Server } from "socket.io";
import { rooms, Room, createPermanentRoom } from "./room.ts";
import {
	getRecentBugReports,
	resolveBugReport,
	getAdminUsers,
	getAdminUserCount,
	getAdminUserById,
	getRecentSessions,
	getSessionsForUser,
	getUsernamesForIp,
	getIpsForUsername,
	findUserById,
	findUserByUsername,
	updateUserProfile,
	bumpSessionVersion,
	grantCrate,
	grantUnlock,
	removeClanMember,
	issueBan,
	issueMute,
	liftBan,
	liftMute,
	listActiveBans,
	listActiveMutes,
	getActiveBanFor,
	getActiveMuteFor,
	getUserRole,
	setUserRole,
	writeAudit,
	getRecentAudit,
	getAuditCount,
	getRecentChat,
	getDailyActiveUsers,
	getModePopularity,
	getCrateSources,
	getQuestCompletion,
	getRetention,
	getServerStatsSince,
	deleteUnlock,
	resetStats,
	setScore,
} from "./db.ts";
import { log, formatDuration, setLogLevel, type LogLevel } from "./log.ts";
import { createRateLimiter, getClientIp } from "./security.ts";
import { validateSession } from "./session.ts";
import { isMaintenanceEnabled, setMaintenance } from "./server-ops.ts";
import {
	canAccess,
	expiryFromMinutes,
	parseRole,
	sanctionSubject,
	type AdminAction,
	type AdminRole,
} from "./moderation-core.ts";

// Admin panel: read endpoints plus the full moderation stack (kick, ban, mute,
// room control, account edits, server ops). Two ways in:
//
//   1. ADMIN_TOKEN as a Bearer token — the break-glass path, always full admin.
//   2. A normal session cookie for an account whose `role` is mod or admin —
//      moderators act under their own name, and the audit trail shows it.
//
// Every mutating route checks permissions (mods get the daily toolbox; anything
// structural or irreversible is admin-only) and writes an admin_audit row.

const ADMIN_TOKEN = (process.env.ADMIN_TOKEN ?? "").trim();
const MIN_ADMIN_TOKEN_LENGTH = 16;

export function adminEnabled(): boolean {
	return ADMIN_TOKEN.length >= MIN_ADMIN_TOKEN_LENGTH;
}

export function logAdminConfig(): void {
	if (!adminEnabled()) {
		log.warn(
			"boot",
			"ADMIN_TOKEN is unset or too short — the admin dashboard is disabled",
		);
	} else {
		log.info("boot", "admin dashboard: enabled");
	}
}

function tokenMatches(supplied: string): boolean {
	const expected = Buffer.from(ADMIN_TOKEN);
	const given = Buffer.from(supplied.trim());
	// length mismatch is safe to short-circuit on (both are just byte buffers here)
	if (given.length !== expected.length) return false;
	return timingSafeEqual(given, expected);
}

// Reject failed admin auth after 5 attempts per minute per IP. This used to gate
// only the log line, so the token itself could be guessed as fast as the network
// allowed — the limiter looked like a defence but was purely cosmetic.
const adminAuthLimiter = createRateLimiter(5, 60_000);
// separate budget, so a noisy attacker can't also starve the log lines
const adminAuthLogLimiter = createRateLimiter(5, 60_000);

// --- actors -------------------------------------------------------------------

type AdminActor = {
	name: string;
	role: AdminRole;
	via: "token" | "session";
	userId?: number;
};

type AdminEnv = { Variables: { actor: AdminActor } };

// --- lobby presence -----------------------------------------------------------
//
// The root namespace is the "lobby": the menu connects here before joining a
// game room (see index.ts), and the client swaps to a room namespace on join.
// Tracking these sockets gives the admin a view of who is sat in the menu.
type LobbyPlayer = { username: string; ip: string; connectedAt: number };
const lobbyPlayers = new Map<string, LobbyPlayer>();

export function trackLobbyPlayer(socketId: string, username: string, ip: string): void {
	lobbyPlayers.set(socketId, { username, ip, connectedAt: Date.now() });
}

export function untrackLobbyPlayer(socketId: string): void {
	lobbyPlayers.delete(socketId);
}

// --- overview -------------------------------------------------------------------

function buildOverview() {
	const allPlayers = rooms.flatMap((r) => r.game.players);
	const humans = allPlayers.filter((p) => !p.isBot).length;
	const bots = allPlayers.length - humans;

	return {
		server: {
			rooms: rooms.length,
			humans,
			bots,
			lobby: lobbyPlayers.size,
			maintenance: isMaintenanceEnabled(),
			logLevel: log.level,
			generatedAt: new Date().toISOString(),
		},
		rooms: rooms.map((r) => ({
			name: r.name,
			mode: r.game.mode.code,
			modeName: r.game.mode.name,
			permanent: r.isPermanent,
			occupancy: r.occupancy(),
			maxPlayers: r.game.maxPlayers,
			bots: r.game.players.filter((p) => p.isBot).length,
			leaderboardScore: r.game.score.lb,
			players: r.game.players.map((p) => {
				const base = {
					name: p.name,
					human: !p.isBot,
					team: p.team,
					score: p.score,
					kills: p.kills,
					deaths: p.deaths,
					isBoss: p.isBoss,
					classIndex: p.classIndex,
					connected: !!p.socketId,
					userId: p.userId ?? null,
					account: p.accountName ?? null,
					ip: p.ip ?? null,
					sessionFor: p.sessionStartedAt
						? formatDuration(Date.now() - p.sessionStartedAt)
						: null,
				};
				if (p.isBot) return { ...base, banned: false, muted: false };
				const banned = !!getActiveBanFor(p.userId ?? null, p.ip ?? null);
				const muted = !banned && !!getActiveMuteFor(p.userId ?? null, p.ip ?? null);
				return { ...base, banned, muted };
			}),
		})),
		lobby: [...lobbyPlayers.values()].map((l) => ({
			username: l.username,
			ip: l.ip,
			connectedFor: formatDuration(Date.now() - l.connectedAt),
		})),
	};
}

// --- route helpers ---------------------------------------------------------------

function bad(c: { json: (body: unknown, status: number) => Response }, message: string, status = 400) {
	return c.json({ error: message }, status);
}

function intParam(value: string | undefined): number | null {
	const n = Number.parseInt(value ?? "", 10);
	return Number.isInteger(n) && n > 0 ? n : null;
}

function requestIp(c: { req: { header: (name: string) => string | undefined } }): string {
	return getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
}

function audited(
	c: { req: { header: (name: string) => string | undefined } },
	actor: AdminActor,
	action: string,
	target: string,
	payload?: unknown,
): void {
	writeAudit({
		actor: actor.name,
		action,
		target,
		payload: payload === undefined ? undefined : JSON.stringify(payload),
		ip: requestIp(c),
	});
}

/** Permission gate: returns the actor, or a 403 Response to return. */
function permit(c: Context<AdminEnv>, action: AdminAction): AdminActor | Response {
	const actor = c.get("actor");
	if (!canAccess(actor.role, action)) {
		return bad(c, "Forbidden — this action requires the admin role", 403);
	}
	return actor;
}

/** Kick every live socket belonging to an account, across all rooms. */
function kickAccountEverywhere(userId: number, reason: string): number {
	let kicked = 0;
	for (const room of rooms) {
		for (const player of [...room.game.players]) {
			if (player.userId === userId && player.socketId) {
				if (room.adminKickPlayer(player.index, reason)) kicked++;
			}
		}
	}
	return kicked;
}

/** Issue a sanction against a live player (account-first, IP fallback). */
function sanctionPlayer(
	room: Room,
	index: number,
	kind: "ban" | "mute",
	opts: { reason: string; minutes: number | null; issuedBy: string },
): { ok: boolean; subject?: { kind: "user" | "ip"; value: string }; error?: string } {
	const player = room.findPlayerByIndex(index);
	if (!player) return { ok: false, error: "Player not found" };
	const subject = sanctionSubject({ userId: player.userId, ip: player.ip });
	if (!subject) return { ok: false, error: "Player has no identity to sanction" };
	const sanction = {
		...subject,
		reason: opts.reason,
		issuedBy: opts.issuedBy,
		expiresAt: expiryFromMinutes(opts.minutes, Date.now()),
	};
	if (kind === "ban") issueBan(sanction);
	else issueMute(sanction);
	return { ok: true, subject };
}

type SanctionBody = { reason?: unknown; minutes?: unknown };

function parseSanctionBody(body: SanctionBody): { reason: string; minutes: number | null } | null {
	const reason = typeof body.reason === "string" ? body.reason.trim().substring(0, 200) : "";
	const minutes =
		body.minutes == null ? null : Number(body.minutes);
	if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) return null;
	return { reason: reason || "No reason given", minutes };
}

// --- routes -----------------------------------------------------------------------

export function createAdminRoutes(io: Server): Hono<AdminEnv> {
	const app = new Hono<AdminEnv>();

	app.use("*", async (c, next) => {
		const ip = requestIp(c);
		const auth = c.req.header("Authorization") ?? "";
		const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

		let actor: AdminActor | null = null;
		if (token && adminEnabled() && tokenMatches(token)) {
			actor = { name: "token-admin", role: "admin", via: "token" };
		} else {
			// session path: the browser sends the vertix_session cookie same-origin
			const session = await validateSession(c.req.header("Cookie"));
			if (session) {
				const role = getUserRole(session.userId);
				if (role === "mod" || role === "admin") {
					actor = { name: session.username, role, via: "session", userId: session.userId };
				}
			}
		}

		if (!actor) {
			if (adminAuthLogLimiter(ip)) {
				log.warn("admin", `unauthorized admin request from ${ip}`);
			}
			if (!adminAuthLimiter(ip)) {
				return c.json({ error: "Too many attempts" }, 429);
			}
			return c.json({ error: "Unauthorized" }, 401);
		}
		c.set("actor", actor);
		await next();
	});

	// --- reads ---

	app.get("/overview", (c) => c.json(buildOverview()));

	app.get("/bugReports", (c) => c.json(getRecentBugReports(100)));

	app.get("/users", (c) => {
		const q = c.req.query("q")?.trim() || undefined;
		const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
		const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
		const offset = (page - 1) * limit;
		return c.json({
			users: getAdminUsers(limit, offset, q),
			total: getAdminUserCount(q),
			page,
			limit,
		});
	});

	app.get("/users/:id", (c) => {
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const user = getAdminUserById(id);
		if (!user) return bad(c, "Not found", 404);
		return c.json({
			user,
			sessions: getSessionsForUser(id, 50),
			ips: getIpsForUsername(user.username),
			ban: getActiveBanFor(id, null),
			mute: getActiveMuteFor(id, null),
		});
	});

	app.get("/sessions", (c) => {
		const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query("limit") ?? "100", 10) || 100));
		return c.json(getRecentSessions(limit));
	});

	app.get("/ips/:ip", (c) => c.json(getUsernamesForIp(c.req.param("ip"))));

	app.get("/bans", (c) => c.json(listActiveBans()));
	app.get("/mutes", (c) => c.json(listActiveMutes()));

	app.get("/chat", (c) => {
		const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query("limit") ?? "100", 10) || 100));
		return c.json(getRecentChat(limit, c.req.query("room") || undefined));
	});

	app.get("/audit", (c) => {
		const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
		const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
		return c.json({
			entries: getRecentAudit(limit, (page - 1) * limit),
			total: getAuditCount(),
			page,
			limit,
		});
	});

	app.get("/stats", (c) => {
		return c.json({
			dau: getDailyActiveUsers(14),
			modes: getModePopularity(),
			crateSources: getCrateSources(),
			quests: getQuestCompletion(),
			retention: getRetention(),
			concurrency: getServerStatsSince(Date.now() - 6 * 60 * 60_000),
		});
	});

	app.get("/server/state", (c) => {
		return c.json({
			maintenance: isMaintenanceEnabled(),
			logLevel: log.level,
		});
	});

	// --- live player actions ---

	app.post("/players/:room/:index/kick", (c) => {
		const actor = permit(c, "kick");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const reason = "Kicked by a moderator";
		if (!room.adminKickPlayer(index, reason)) return bad(c, "Player not found", 404);
		audited(c, actor, "kick", `${room.name}#${index}`);
		return c.json({ ok: true });
	});

	app.post("/players/:room/:index/ban", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseSanctionBody(body);
		if (!parsed) return bad(c, "Invalid body");
		// permanent bans are admin-only; timed bans are in the mod toolbox
		const actor = permit(c, parsed.minutes === null ? "ban" : "tempban");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const result = sanctionPlayer(room, index, "ban", { ...parsed, issuedBy: actor.name });
		if (!result.ok) return bad(c, result.error ?? "Could not ban");
		// a banned account must not keep its session: invalidate the JWT and kick
		if (result.subject?.kind === "user") {
			const userId = Number(result.subject.value);
			bumpSessionVersion(userId);
			kickAccountEverywhere(userId, `You are banned: ${parsed.reason}`);
		} else {
			room.adminKickPlayer(index, `You are banned: ${parsed.reason}`);
		}
		audited(c, actor, "ban", `${result.subject?.kind}:${result.subject?.value}`, parsed);
		return c.json({ ok: true, subject: result.subject });
	});

	app.post("/players/:room/:index/mute", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseSanctionBody(body);
		if (!parsed) return bad(c, "Invalid body");
		const actor = permit(c, "mute");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const result = sanctionPlayer(room, index, "mute", { ...parsed, issuedBy: actor.name });
		if (!result.ok) return bad(c, result.error ?? "Could not mute");
		audited(c, actor, "mute", `${result.subject?.kind}:${result.subject?.value}`, parsed);
		return c.json({ ok: true, subject: result.subject });
	});

	app.post("/players/:room/:index/team", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const body = await c.req.json().catch(() => ({}));
		if (body.team !== "red" && body.team !== "blue") return bad(c, "team must be red or blue");
		if (!room.adminSetTeam(index, body.team)) return bad(c, "Player not found", 404);
		audited(c, actor, "setTeam", `${room.name}#${index}`, body);
		return c.json({ ok: true });
	});

	app.post("/players/:room/:index/respawn", (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		if (!room.adminRespawnPlayer(index)) return bad(c, "Player not found", 404);
		audited(c, actor, "respawn", `${room.name}#${index}`);
		return c.json({ ok: true });
	});

	app.post("/players/:room/:index/score", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const body = await c.req.json().catch(() => ({}));
		const delta = Number(body.delta);
		if (!Number.isFinite(delta)) return bad(c, "delta must be a number");
		if (!room.adminAdjustScore(index, delta)) return bad(c, "Player not found", 404);
		audited(c, actor, "adjustScore", `${room.name}#${index}`, { delta });
		return c.json({ ok: true });
	});

	app.post("/players/:room/:index/boss", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("room"));
		if (!room) return bad(c, "Room not found", 404);
		const index = intParam(c.req.param("index"));
		if (index === null) return bad(c, "Invalid index");
		const body = await c.req.json().catch(() => ({}));
		const value = body.value === true;
		if (!room.adminSetBoss(index, value)) return bad(c, "Player not found", 404);
		audited(c, actor, "setBoss", `${room.name}#${index}`, { value });
		return c.json({ ok: true });
	});

	// --- account actions ---

	app.post("/accounts/:id/ban", async (c) => {
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const user = findUserById(id);
		if (!user) return bad(c, "User not found", 404);
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseSanctionBody(body);
		if (!parsed) return bad(c, "Invalid body");
		const actor = permit(c, parsed.minutes === null ? "ban" : "tempban");
		if (actor instanceof Response) return actor;
		issueBan({
			kind: "user",
			value: String(id),
			reason: parsed.reason,
			issuedBy: actor.name,
			expiresAt: expiryFromMinutes(parsed.minutes, Date.now()),
		});
		bumpSessionVersion(id);
		kickAccountEverywhere(id, `You are banned: ${parsed.reason}`);
		audited(c, actor, "ban", `user:${id} (${user.username})`, parsed);
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/unban", (c) => {
		const actor = permit(c, "unban");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const lifted = liftBan("user", String(id), actor.name);
		audited(c, actor, "unban", `user:${id}`);
		return c.json({ ok: lifted });
	});

	app.post("/accounts/:id/mute", async (c) => {
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseSanctionBody(body);
		if (!parsed) return bad(c, "Invalid body");
		const actor = permit(c, "mute");
		if (actor instanceof Response) return actor;
		issueMute({
			kind: "user",
			value: String(id),
			reason: parsed.reason,
			issuedBy: actor.name,
			expiresAt: expiryFromMinutes(parsed.minutes, Date.now()),
		});
		audited(c, actor, "mute", `user:${id}`, parsed);
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/unmute", (c) => {
		const actor = permit(c, "mute");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const lifted = liftMute("user", String(id), actor.name);
		audited(c, actor, "unmute", `user:${id}`);
		return c.json({ ok: lifted });
	});

	app.post("/accounts/:id/rename", async (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const user = findUserById(id);
		if (!user) return bad(c, "User not found", 404);
		const body = await c.req.json().catch(() => ({}));
		const username = typeof body.username === "string" ? body.username.trim() : "";
		if (!/^[A-Za-z0-9_-]{3,15}$/.test(username)) {
			return bad(c, "Username must be 3-15 chars: letters, numbers, _ or -");
		}
		if (!updateUserProfile(id, username, user.channel)) {
			return bad(c, "That username is taken");
		}
		audited(c, actor, "rename", `user:${id}`, { from: user.username, to: username });
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/score", async (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const body = await c.req.json().catch(() => ({}));
		const score = Number(body.score);
		if (!Number.isFinite(score) || score < 0 || score > 100_000_000) {
			return bad(c, "score must be a sane non-negative number");
		}
		setScore(id, Math.trunc(score));
		audited(c, actor, "setScore", `user:${id}`, { score });
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/crate", async (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const body = await c.req.json().catch(() => ({}));
		const count = Math.min(50, Math.max(1, Number(body.count) || 1));
		for (let i = 0; i < count; i++) grantCrate(id, "admin");
		audited(c, actor, "grantCrate", `user:${id}`, { count });
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/unlock", async (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const body = await c.req.json().catch(() => ({}));
		const itemType = body.itemType;
		const itemId = Number(body.itemId);
		if (
			(itemType !== "hat" && itemType !== "shirt" && itemType !== "camo") ||
			!Number.isInteger(itemId) || itemId <= 0
		) {
			return bad(c, "itemType must be hat/shirt/camo and itemId a positive integer");
		}
		if (body.grant === false) {
			deleteUnlock(id, itemType, itemId);
			audited(c, actor, "revokeUnlock", `user:${id}`, { itemType, itemId });
		} else {
			grantUnlock(id, itemType, itemId);
			audited(c, actor, "grantUnlock", `user:${id}`, { itemType, itemId });
		}
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/resetStats", (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		resetStats(id);
		audited(c, actor, "resetStats", `user:${id}`);
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/forceLogout", (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		bumpSessionVersion(id);
		const kicked = kickAccountEverywhere(id, "Logged out by an admin");
		audited(c, actor, "forceLogout", `user:${id}`, { kicked });
		return c.json({ ok: true, kicked });
	});

	app.post("/accounts/:id/clan/remove", (c) => {
		const actor = permit(c, "accountEdit");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		removeClanMember(id);
		audited(c, actor, "removeFromClan", `user:${id}`);
		return c.json({ ok: true });
	});

	app.post("/accounts/:id/role", async (c) => {
		const actor = permit(c, "roleSet");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		const body = await c.req.json().catch(() => ({}));
		const role = parseRole(body.role);
		if (!role) return bad(c, "role must be player, mod or admin");
		if (actor.userId === id && role !== "admin") {
			return bad(c, "You cannot demote your own account");
		}
		setUserRole(id, role);
		audited(c, actor, "setRole", `user:${id}`, { role });
		return c.json({ ok: true });
	});

	// --- manual sanctions by username / IP (not tied to a live player) ---

	app.post("/moderation/ban", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseModerationBody(body);
		if (!parsed) return bad(c, "Invalid body");
		const actor = permit(c, parsed.minutes === null ? "ban" : "tempban");
		if (actor instanceof Response) return actor;
		const result = resolveModerationSubject(parsed.kind, parsed.value);
		if (!result) return bad(c, "User not found", 404);
		issueBan({ ...result, reason: parsed.reason, issuedBy: actor.name, expiresAt: expiryFromMinutes(parsed.minutes, Date.now()) });
		if (result.kind === "user") {
			const userId = Number(result.value);
			bumpSessionVersion(userId);
			kickAccountEverywhere(userId, `You are banned: ${parsed.reason}`);
		}
		audited(c, actor, "ban", `${result.kind}:${result.value}`, parsed);
		return c.json({ ok: true, subject: result });
	});

	app.post("/moderation/unban", async (c) => {
		const actor = permit(c, "unban");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const kind = body.kind === "ip" ? "ip" : "user";
		const value = typeof body.value === "string" ? body.value.trim() : "";
		if (!value) return bad(c, "value required");
		const resolved = resolveModerationSubject(kind, value);
		if (!resolved) return bad(c, "User not found", 404);
		const lifted = liftBan(resolved.kind, resolved.value, actor.name);
		audited(c, actor, "unban", `${resolved.kind}:${resolved.value}`);
		return c.json({ ok: lifted });
	});

	app.post("/moderation/mute", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = parseModerationBody(body);
		if (!parsed) return bad(c, "Invalid body");
		const actor = permit(c, "mute");
		if (actor instanceof Response) return actor;
		const result = resolveModerationSubject(parsed.kind, parsed.value);
		if (!result) return bad(c, "User not found", 404);
		issueMute({ ...result, reason: parsed.reason, issuedBy: actor.name, expiresAt: expiryFromMinutes(parsed.minutes, Date.now()) });
		audited(c, actor, "mute", `${result.kind}:${result.value}`, parsed);
		return c.json({ ok: true, subject: result });
	});

	app.post("/moderation/unmute", async (c) => {
		const actor = permit(c, "mute");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const kind = body.kind === "ip" ? "ip" : "user";
		const value = typeof body.value === "string" ? body.value.trim() : "";
		if (!value) return bad(c, "value required");
		const resolved = resolveModerationSubject(kind, value);
		if (!resolved) return bad(c, "User not found", 404);
		const lifted = liftMute(resolved.kind, resolved.value, actor.name);
		audited(c, actor, "unmute", `${resolved.kind}:${resolved.value}`);
		return c.json({ ok: lifted });
	});

	// --- room actions ---

	app.post("/rooms/open", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const name = typeof body.name === "string" ? body.name.trim().toUpperCase() : "";
		// permanent rooms are the ranked ones: DEV0-8 by convention, but any
		// [A-Z0-9]{2,10} code is allowed so an event room can be opened
		if (!/^[A-Z0-9]{2,10}$/.test(name)) return bad(c, "Room name must be 2-10 letters/digits");
		if (rooms.some((r) => r.name === name)) return bad(c, "A room with that name already exists");
		const modeIndex = Math.trunc(Number(body.modeIndex));
		const room = createPermanentRoom(io, name, Number.isFinite(modeIndex) ? modeIndex : 0);
		audited(c, actor, "openRoom", name, { modeIndex: room.game.mode.code });
		return c.json({ ok: true, room: room.name, mode: room.game.mode.code });
	});

	app.post("/rooms/:name/close", (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("name"));
		if (!room) return bad(c, "Room not found", 404);
		const wasPermanent = room.isPermanent;
		room.close();
		audited(c, actor, "closeRoom", room.name, { wasPermanent });
		return c.json({ ok: true });
	});

	app.post("/rooms/:name/configure", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("name"));
		if (!room) return bad(c, "Room not found", 404);
		const data = await c.req.json().catch(() => ({}));
		// configure() clamps every field (players 2-8, multipliers, mode indices)
		const mapAccepted = room.configure(data);
		audited(c, actor, "configureRoom", room.name, data);
		return c.json({ ok: true, mapAccepted });
	});

	app.post("/rooms/:name/restart", (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("name"));
		if (!room) return bad(c, "Room not found", 404);
		room.adminRestartRound();
		audited(c, actor, "restartRound", room.name);
		return c.json({ ok: true });
	});

	app.post("/rooms/:name/bots", async (c) => {
		const actor = permit(c, "roomManage");
		if (actor instanceof Response) return actor;
		const room = rooms.find((r) => r.name === c.req.param("name"));
		if (!room) return bad(c, "Room not found", 404);
		const body = await c.req.json().catch(() => ({}));
		const delta = Math.trunc(Number(body.delta));
		if (delta !== 1 && delta !== -1) return bad(c, "delta must be 1 or -1");
		const count = room.adminAdjustBots(delta);
		audited(c, actor, "adjustBots", room.name, { delta, count });
		return c.json({ ok: true, bots: count });
	});

	// --- server actions ---

	app.post("/server/broadcast", async (c) => {
		const actor = permit(c, "serverManage");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const message = typeof body.message === "string" ? body.message.trim().substring(0, 200) : "";
		if (!message) return bad(c, "message required");
		// the "5" channel is the in-game notification feed every client renders
		io.emit("5", message);
		for (const room of rooms) room.io.emit("5", message);
		audited(c, actor, "broadcast", "server", { message });
		return c.json({ ok: true });
	});

	app.post("/server/maintenance", async (c) => {
		const actor = permit(c, "serverManage");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const enabled = body.enabled === true;
		setMaintenance(enabled);
		log.warn("admin", `maintenance mode ${enabled ? "enabled" : "disabled"} by ${actor.name}`);
		audited(c, actor, "maintenance", "server", { enabled });
		return c.json({ ok: true, maintenance: enabled });
	});

	app.post("/server/logLevel", async (c) => {
		const actor = permit(c, "serverManage");
		if (actor instanceof Response) return actor;
		const body = await c.req.json().catch(() => ({}));
		const level = body.level;
		if (level !== "debug" && level !== "info" && level !== "warn" && level !== "error") {
			return bad(c, "level must be debug, info, warn or error");
		}
		if (!setLogLevel(level as LogLevel)) return bad(c, "Invalid level");
		log.info("admin", `log level changed to ${level} by ${actor.name}`);
		audited(c, actor, "logLevel", "server", { level });
		return c.json({ ok: true, logLevel: level });
	});

	// --- bug reports ---

	app.post("/bugReports/:id/resolve", (c) => {
		const actor = permit(c, "bugResolve");
		if (actor instanceof Response) return actor;
		const id = intParam(c.req.param("id"));
		if (!id) return bad(c, "Invalid id");
		resolveBugReport(id);
		audited(c, actor, "resolveBugReport", `bug:${id}`);
		return c.json({ ok: true });
	});

	return app;
}

// --- manual sanction helpers ------------------------------------------------------

function parseModerationBody(body: {
	kind?: unknown;
	value?: unknown;
	reason?: unknown;
	minutes?: unknown;
}): { kind: "user" | "ip"; value: string; reason: string; minutes: number | null } | null {
	const kind = body.kind === "ip" ? "ip" : "user";
	const value = typeof body.value === "string" ? body.value.trim() : "";
	if (!value) return null;
	const parsed = parseSanctionBody(body);
	if (!parsed) return null;
	return { kind, value, reason: parsed.reason, minutes: parsed.minutes };
}

/** For kind='user' the value is a username — resolve it to the stable userId. */
function resolveModerationSubject(
	kind: "user" | "ip",
	value: string,
): { kind: "user" | "ip"; value: string } | null {
	if (kind === "ip") return { kind: "ip", value };
	const user = findUserByUsername(value);
	if (!user) return null;
	return { kind: "user", value: String(user.id) };
}
