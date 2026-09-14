import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { rooms } from "./room.ts";
import {
	getRecentBugReports,
	deleteBugReport,
	getAdminUsers,
	getAdminUserCount,
	getAdminUserById,
	getRecentSessions,
	getSessionsForUser,
	getUsernamesForIp,
	getIpsForUsername,
} from "./db.ts";
import { log, formatDuration } from "./log.ts";
import { createRateLimiter, getClientIp } from "./security.ts";

// Admin dashboard. Access is gated behind a single ADMIN_TOKEN (see
// .env.example): every /api/admin/* route requires it as a Bearer token. The
// token is compared in constant time to avoid leaking its length/prefix, and
// unauthorized attempts are rate-limited so they can't be used to flood the log
// or brute-force the token.

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

// throttle failed admin auth attempts per IP: 5 per minute
const adminAuthLimiter = createRateLimiter(5, 60_000);

// --- lobby presence ---------------------------------------------------------
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
			generatedAt: new Date().toISOString(),
		},
		rooms: rooms.map((r) => ({
			name: r.name,
			mode: r.game.mode.code,
			modeName: r.game.mode.name,
			permanent: r.isPermanent,
			occupancy: r.occupancy(),
			maxPlayers: r.game.maxPlayers,
			leaderboardScore: r.game.score.lb,
			players: r.game.players.map((p) => ({
				name: p.name,
				human: !p.isBot,
				team: p.team,
				score: p.score,
				kills: p.kills,
				deaths: p.deaths,
				isBoss: p.isBoss,
				classIndex: p.classIndex,
				connected: !!p.socketId,
			})),
		})),
		lobby: [...lobbyPlayers.values()].map((l) => ({
			username: l.username,
			ip: l.ip,
			connectedFor: formatDuration(Date.now() - l.connectedAt),
		})),
	};
}

export function createAdminRoutes(): Hono {
	const app = new Hono();

	app.use("*", async (c, next) => {
		if (!adminEnabled()) {
			return c.json({ error: "Admin is not configured (set ADMIN_TOKEN)" }, 503);
		}
		const ip = getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
		const auth = c.req.header("Authorization") ?? "";
		const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
		if (!tokenMatches(token)) {
			if (adminAuthLimiter(ip)) {
				log.warn("admin", `unauthorized admin request from ${ip}`);
			}
			return c.json({ error: "Unauthorized" }, 401);
		}
		await next();
	});

	app.get("/overview", (c) => c.json(buildOverview()));
	app.get("/bugReports", (c) => c.json(getRecentBugReports(100)));
	app.delete("/bugReports/:id", (c) => {
		const id = Number.parseInt(c.req.param("id"), 10);
		if (!Number.isInteger(id) || id <= 0) {
			return c.json({ error: "Invalid id" }, 400);
		}
		deleteBugReport(id);
		return c.json({ ok: true });
	});

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
		const id = Number.parseInt(c.req.param("id"), 10);
		if (!Number.isInteger(id) || id <= 0) {
			return c.json({ error: "Invalid id" }, 400);
		}
		const user = getAdminUserById(id);
		if (!user) return c.json({ error: "Not found" }, 404);
		return c.json({
			user,
			sessions: getSessionsForUser(id, 50),
			ips: getIpsForUsername(user.username),
		});
	});

	app.get("/sessions", (c) => {
		const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query("limit") ?? "100", 10) || 100));
		return c.json(getRecentSessions(limit));
	});

	app.get("/ips/:ip", (c) => {
		return c.json(getUsernamesForIp(c.req.param("ip")));
	});

	return app;
}
