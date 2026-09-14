import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { Server, type Socket } from "socket.io";
import fs from "fs";
import path from "path";
import Stream from "node:stream";
import { fileURLToPath } from "url";
import { gameModes } from "core/src/gamemodes.ts";
import { Room, rooms } from "./room.ts";
import {
	createRateLimiter,
	createConnectionLimiter,
	getClientIp,
	trustsProxy,
} from "./security.ts";
import {
	initDb,
	getLeaderboard,
	getClanLeaderboard,
	getProfile,
	getAllUserScores,
	findClanByName,
	getClanStats,
	findUserById,
	findUserByUsername,
	getDiscordConnectedUsers,
	createBugReport,
} from "./db.ts";
import { validateSession } from "./session.ts";
import { checkForNewUnlocks, getUserUnlockedItems } from "./unlocks.ts";
import {
	setupAuthHandlers,
	setupProfileHandler,
	attachSocketSession,
	emitAccountStats,
	emitUnlocks,
	recordLoginForSocket,
	type AuthenticatedSocket,
} from "./auth.ts";
import { createOAuthRoutes, logOAuthConfig } from "./oauth.ts";
import { createAdminRoutes, trackLobbyPlayer, untrackLobbyPlayer, logAdminConfig } from "./admin.ts";
import { ADMIN_PAGE_HTML } from "./admin-page.ts";
import { log, formatDuration } from "./log.ts";
import { defaultGenData } from "./maps.ts";

const bootStartedAt = Date.now();
const isProd = process.env.NODE_ENV === "production";

log.raw("");
log.raw("  VERTIX ONLINE — game server");
log.info("boot", `node ${process.version}, env=${isProd ? "production" : "development"}, log level=${log.level}`);
log.info("boot", `maps: ${defaultGenData.length} loaded`);

initDb();
log.info("boot", `database ready (${process.env.DATA_DIR ? `${process.env.DATA_DIR}/vertix.db` : "server/vertix.db"})`);

// one-off backfill: unlock whatever every existing account's current lifetime
// score already qualifies for, so switching on enforcement doesn't suddenly
// lock people out of cosmetics they were already using freely
let backfilled = 0;
for (const { user_id, score } of getAllUserScores()) {
	checkForNewUnlocks(user_id, score);
	backfilled++;
}
log.info("boot", `accounts: ${backfilled} known, unlocks backfilled`);

const allowedOrigins = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
	: ["http://localhost:4173", "http://localhost:5173", "http://localhost:1118"];

if (process.env.NODE_ENV === "production" && allowedOrigins.includes("*")) {
	throw new Error("CORS_ORIGINS must not contain '*' in production");
}
log.info("boot", `cors origins: ${allowedOrigins.join(", ")}`);
logOAuthConfig();
logAdminConfig();

const createRoomLimiter = createRateLimiter(3, 60000);
const profileLimiter = createRateLimiter(30, 60000);
const leaderboardLimiter = createRateLimiter(20, 60000);
// room browser + autoJoin poll: generous enough for a few open tabs, but still
// stops an unauthenticated client from hammering the room list
const roomBrowserLimiter = createRateLimiter(60, 60000);
// bug reports: generous enough for a legit user, but stops a bot spamming the DB
const bugReportLimiter = createRateLimiter(5, 600000);
// Households, phone networks and schools share one address, so a low per-IP cap
// locks out legitimate players sitting next to each other. The real protection
// against a single abusive host is the global cap below.
const connectionLimiter = createConnectionLimiter(20);
const MAX_CONNECTIONS = 400;
let openConnections = 0;
// Each Room allocates a 16ms position interval, a 100ms bot interval, 100
// projectiles and a tile map, and only closes 60s after emptying. Without a
// ceiling, room creation is a memory/CPU exhaustion primitive.
const MAX_ROOMS = 200;

if (process.env.NODE_ENV === "production" && !trustsProxy()) {
	log.warn(
		"boot",
		"TRUST_PROXY is not set — if this server sits behind a reverse proxy, every " +
			"player will share one rate-limit key. See .env.example",
	);
}

const io = new Server({
	cors: {
		origin: allowedOrigins,
		methods: ["GET"],
	},
	// The `cors` option above only decorates the handshake response; browsers do
	// not apply CORS to WebSocket upgrades and non-browser clients ignore it
	// entirely. allowRequest is the only place the origin is actually enforced.
	allowRequest: (req, callback) => {
		const origin = req.headers.origin;
		// No Origin header is the NORMAL case here: browsers omit it on same-origin
		// requests, and in production the page and socket share an origin — so
		// rejecting on absence blocks every real player. What this guard is for is
		// the cross-site case, and a browser always sends Origin for those.
		if (!origin) return callback(null, true);
		callback(null, allowedOrigins.includes(origin));
	},
});

function makeRoomCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const randomBytes = new Uint8Array(5);
	crypto.getRandomValues(randomBytes);
	let code = "";
	for (let i = 0; i < 5; i++) {
		code += chars[randomBytes[i] % chars.length];
	}
	return code;
}

function createPermanentRoom(io: Server, code: string) {
	const room = new Room(io, code);
	room.isPermanent = true;
	rooms.push(room);
	room.game.newRound(parseInt(code.replace("DEV", ""), 10) || 0);
	room.handleSocket();
	return room;
}

for (let i = 0; i < 9; i++) {
	createPermanentRoom(io, `DEV${i}`);
}
log.info(
	"boot",
	`rooms: ${rooms.length} permanent — ${rooms.map((r) => `${r.name}(${r.game.mode.code})`).join(" ")}`,
);

io.use((socket, next) => {
	// socket.io reads the raw TCP peer, which behind a reverse proxy is the proxy
	// itself for every player — see getClientIp.
	const forwarded = socket.handshake.headers["x-forwarded-for"];
	const ip = getClientIp(
		Array.isArray(forwarded) ? forwarded.join(",") : forwarded,
		socket.handshake.address,
	);
	if (openConnections >= MAX_CONNECTIONS) {
		return next(new Error("Server full"));
	}
	if (!connectionLimiter.increment(ip)) {
		return next(new Error("Too many connections"));
	}
	openConnections++;
	let released = false;
	socket.on("disconnect", () => {
		if (released) return;
		released = true;
		openConnections--;
		connectionLimiter.decrement(ip);
	});
	next();
});

io.use(async (socket, next) => {
	await attachSocketSession(socket as AuthenticatedSocket);
	next();
});

// the root ("lobby") namespace: the menu connects here before joining a game
// room so quests/account/unlocks work in the menu. Reuses the same auth handlers
// as room namespaces; the client swaps to a room socket on join.
io.on("connection", (socket: Socket) => {
	const authSocket = socket as AuthenticatedSocket;
	const forwarded = socket.handshake.headers["x-forwarded-for"];
	const ip = getClientIp(
		Array.isArray(forwarded) ? forwarded.join(",") : forwarded,
		socket.handshake.address,
	);
	// the root namespace is the menu/lobby — track presence for the admin dashboard
	trackLobbyPlayer(socket.id, authSocket.username ?? "(guest)", ip);
	socket.on("disconnect", () => untrackLobbyPlayer(socket.id));
	setupAuthHandlers(authSocket);
	setupProfileHandler(socket);
	// count today's login before emitting stats, so any streak score/crate is included
	recordLoginForSocket(authSocket);
	// If session cookie validated, emit account data + owned cosmetics automatically
	emitAccountStats(authSocket);
	emitUnlocks(authSocket);
});

const api = new Hono();

api.use(secureHeaders());
api.use(
	bodyLimit({
		maxSize: 150 * 1024, // a max-size (64x64) genData upload JSON-encodes to ~65KB; isValidGenData bounds it further
		onError: (c) => c.json({ error: "Request body too large" }, 413),
	}),
);
api.use(
	cors({
		origin: allowedOrigins,
	}),
);

api.route("/", createOAuthRoutes());
api.route("/admin", createAdminRoutes());

api.get("/getIP", (c) => {
	if (!roomBrowserLimiter(getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")))) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const roomName = c.req.query("room");
	const room = rooms.find((r) => r.name === roomName);
	if (!room) {
		return c.json({ error: "Room not found" }, 404);
	}
	return c.json({
		ip: "localhost",
		region: "...",
		port: "1119",
		room: room.name,
	});
});

api.get("/autoJoin", (c) => {
	if (!roomBrowserLimiter(getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")))) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const withOne = rooms.find((r) => r.game.players.length === 1 && r.game.players.length < r.game.maxPlayers);
	if (withOne) {
		return c.json({ room: withOne.name });
	}
	const any = rooms.find((r) => r.game.players.length < r.game.maxPlayers);
	if (any) {
		return c.json({ room: any.name });
	}
	return c.json({ room: null });
});

api.post("/createRoom", async (c) => {
	const clientIp = getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
	if (!createRoomLimiter(clientIp)) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	if (rooms.length >= MAX_ROOMS) {
		return c.json({ error: "Server is at room capacity, try again later" }, 503);
	}
	const data = await c.req.json().catch(() => ({}));
	let code: string;
	let attempts = 0;
	do {
		code = makeRoomCode();
		attempts++;
	} while (rooms.some((r) => r.name === code) && attempts < 100);
	if (rooms.some((r) => r.name === code)) {
		return c.json({ error: "Could not generate a room code" }, 500);
	}

	const secretBytes = new Uint8Array(16);
	crypto.getRandomValues(secretBytes);
	const hostSecret = Array.from(secretBytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const room = new Room(io, code);
	room.isPermanent = false;
	room.hostSecret = hostSecret;
	const mapAccepted = room.configure({
		...data,
		srvModes:
			data.srvModes?.length > 0 ? data.srvModes : [gameModes.findIndex((m) => m.code === "ffa")],
	});
	rooms.push(room);
	room.handleSocket();
	log.info(
		"room",
		`${code} created (private, ${room.game.mode.code}, max ${room.game.maxPlayers}${mapAccepted ? "" : ", custom map rejected"})`,
	);

	return c.json({ room: code, hostSecret, mapRejected: !mapAccepted });
});

// Liveness/health for the reverse proxy and for `curl`ing from the host: answers
// with enough to tell at a glance whether the game is actually serving.
api.get("/health", (c) => {
	const players = rooms.flatMap((r) => r.game.players);
	return c.json({
		ok: true,
		uptime: formatDuration(Date.now() - bootStartedAt),
		uptimeSeconds: Math.floor((Date.now() - bootStartedAt) / 1000),
		rooms: rooms.length,
		humans: players.filter((p) => !p.isBot).length,
		bots: players.filter((p) => p.isBot).length,
	});
});

api.get("/getRooms", (c) => {
	if (!roomBrowserLimiter(getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")))) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const list = rooms.map((r) => ({
		n: r.name,
		m: r.game.mode.code,
		// humans only: bots yield their slot when a real player joins, so
		// counting them would make rooms look fuller than they are
		pl: r.game.players.filter((p) => !p.isBot).length,
		mxpl: r.game.maxPlayers,
		lb: r.game.score.lb,
	}));
	return c.json(list);
});

api.get("/getLbs", (c) => {
	// six full-table scans with no cache — cheap for us to serve, cheaper still
	// for someone to loop, so it needs a limiter like every other scan route
	if (!leaderboardLimiter(getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")))) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const rank = getLeaderboard("score", 50);
	const kdrThousand = getLeaderboard("kdr", 50, 1000);
	const kdrAny = getLeaderboard("kdr", 50);
	const kills = getLeaderboard("kills", 50);

	return c.json({
		rank,
		kdrThousand,
		kdrAny,
		kills,
		clanRank: getClanLeaderboard("rank", 50),
		clanKdr: getClanLeaderboard("kdr", 50),
	});
});

api.get("/friends", async (c) => {
	// players in rooms right now (humans only — bots aren't friends)
	const online = rooms.flatMap((r) =>
		r.game.players
			.filter((p) => !p.isBot && p.name !== "UNKNOWN")
			.map((p) => ({
				name: p.name,
				room: r.name,
				mode: r.game.mode.code,
			})),
	);

	// the Discord directory is only visible to players who linked Discord
	// themselves — that's the "friend graph" this feature is built around
	const session = await validateSession(c.req.header("Cookie"));
	const self = session ? findUserById(session.userId) : undefined;
	let discord: { username: string; discordName: string; avatar: string; online: boolean }[] | null =
		null;
	if (self?.discord_id) {
		const onlineNames = new Set(online.map((p) => p.name));
		discord = getDiscordConnectedUsers()
			.filter((u) => u.username !== self.username)
			.map((u) => ({
				username: u.username,
				discordName: u.discord_username,
				avatar: u.discord_avatar,
				online: onlineNames.has(u.username),
			}));
	}

	return c.json({
		online,
		discord,
		selfDiscordConnected: !!self?.discord_id,
		loggedIn: !!session,
	});
});

api.get("/clans", (c) => {
	if (!leaderboardLimiter(getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")))) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	// getClanLeaderboard already computes stats for every clan and only slices
	// to `limit` at the end, so a large limit gives us the full directory
	return c.json(getClanLeaderboard("rank", 500));
});

api.get("/clan/:name", (c) => {
	const clan = findClanByName(c.req.param("name"));
	if (!clan) return c.json({ error: "Clan not found" }, 404);
	const stats = getClanStats(clan.id);
	if (!stats) return c.json({ error: "Clan not found" }, 404);
	return c.json({ name: clan.name, ...stats });
});

api.get("/profile/:username", (c) => {
	const clientIp = getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
	if (!profileLimiter(clientIp)) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const profile = getProfile(c.req.param("username"));
	if (!profile) return c.json({ error: "Player not found" }, 404);
	// unlocked cosmetics double as the profile page's public achievement list
	const user = findUserByUsername(c.req.param("username"));
	const unlocks = user ? getUserUnlockedItems(user.id) : [];
	return c.json({ ...profile, unlocks });
});

// User-submitted bug reports, surfaced in the admin dashboard. Sanitised and
// rate-limited; the report is stored with the (optional) session username, the
// room/mode they were in, their user agent and IP for triage.
api.post("/bugReport", async (c) => {
	const clientIp = getClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"));
	if (!bugReportLimiter(clientIp)) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}
	const data = await c.req.json().catch(() => ({}));
	const strip = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, "").trim();
	const message = strip(typeof data?.message === "string" ? data.message : "").substring(0, 2000);
	if (message.length === 0) {
		return c.json({ error: "Message required" }, 400);
	}
	const session = await validateSession(c.req.header("Cookie"));
	createBugReport({
		message,
		username: session?.username ?? "",
		room: strip(typeof data?.room === "string" ? data.room : "").substring(0, 20),
		mode: strip(typeof data?.mode === "string" ? data.mode : "").substring(0, 20),
		userAgent: strip(c.req.header("user-agent") ?? "").substring(0, 200),
		ip: clientIp,
	});
	log.info("bugreport", `new report from ${session?.username ?? "(guest)"} (${clientIp})`);
	return c.json({ ok: true });
});

// root app: API mounted under /api, static files (production) at /
const app = new Hono();

// Hono does not propagate a mounted sub-app's middleware upward, so registering
// these on `api` alone left the game page itself — the document that holds the
// session cookie — with no CSP, no X-Frame-Options and no nosniff. They belong
// on the root app, before any route.
app.use(
	secureHeaders({
		contentSecurityPolicy: {
			defaultSrc: ["'self'"],
			// the game canvas pipeline builds sprites from mod images, which may be
			// loaded from arbitrary user-supplied URLs, and blobs/data URIs are used
			// for generated textures
			imgSrc: ["'self'", "data:", "blob:", "https:"],
			mediaSrc: ["'self'", "data:", "blob:"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			connectSrc: ["'self'", "ws:", "wss:"],
			workerSrc: ["'self'", "blob:"],
			objectSrc: ["'none'"],
			baseUri: ["'self'"],
			formAction: ["'self'"],
			frameAncestors: ["'none'"],
		},
		// the OAuth popup calls window.opener.postMessage, which same-origin
		// isolation would sever
		crossOriginOpenerPolicy: false,
		strictTransportSecurity:
			process.env.NODE_ENV === "production" ? "max-age=31536000; includeSubDomains" : false,
	}),
);
app.route("/api", api);

// Admin dashboard page. The HTML is public (it does nothing without the token);
// every /api/admin/* call behind it is gated on ADMIN_TOKEN.
app.get("/admin", (c) => {
	c.header("Content-Type", "text/html; charset=utf-8");
	return c.body(ADMIN_PAGE_HTML);
});

const MIME: Record<string, string> = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".ttf": "font/ttf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".zip": "application/zip",
};

// mod packs are served in dev too (the vite dev server proxies /mods here);
// default resolves relative to this file so it works regardless of cwd
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const modsDir = process.env.DATA_DIR
	? path.resolve(process.env.DATA_DIR, "mods")
	: path.resolve(serverDir, "../data/mods");

app.all("/mods/*", (c) => {
	const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
	const filePath = path.join(modsDir, urlPath.replace("/mods/", ""));
	// keep resolved paths inside the mods directory (trailing sep prevents a
	// sibling dir like `mods-evil` from satisfying the prefix check)
	if (!path.resolve(filePath).startsWith(path.resolve(modsDir) + path.sep)) {
		return c.json({ error: "Mod not found" }, 404);
	}
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		return c.json({ error: "Mod not found" }, 404);
	}
	const stat = fs.statSync(filePath);
	const ext = path.extname(filePath);
	const contentType = MIME[ext] || "application/octet-stream";
	const range = c.req.header("range");

	if (range) {
		// Everything here is attacker-controlled. Unclamped, `bytes=0-99999999999`
		// became a Buffer.alloc of ~100GB, and `bytes=-100` an alloc of NaN — both
		// unauthenticated, on a route that sits outside the /api body limit.
		const parts = range.replace(/bytes=/, "").split("-");
		const rawStart = Number.parseInt(parts[0], 10);
		const rawEnd = parts[1] ? Number.parseInt(parts[1], 10) : stat.size - 1;
		const start = Number.isFinite(rawStart) ? rawStart : Number.NaN;
		const end = Number.isFinite(rawEnd) ? Math.min(rawEnd, stat.size - 1) : stat.size - 1;
		if (!Number.isFinite(start) || start < 0 || start > end || start >= stat.size) {
			c.header("Content-Range", `bytes */${stat.size}`);
			return c.body(null, 416);
		}
		c.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
		c.header("Content-Length", (end - start + 1).toString());
		c.header("Content-Type", contentType);
		c.header("Accept-Ranges", "bytes");
		// stream rather than buffering: the range is now bounded by the file, but a
		// large legitimate mod still shouldn't be held in memory per request
		return c.body(
			Stream.Readable.toWeb(
				fs.createReadStream(filePath, { start, end }),
			) as ReadableStream,
			206,
		);
	}

	c.header("Content-Length", stat.size.toString());
	c.header("Content-Type", contentType);
	c.header("Accept-Ranges", "bytes");
	return c.body(fs.readFileSync(filePath));
});

// Production: serve frontend static files
if (process.env.NODE_ENV === "production") {
	const distDir = path.resolve(process.cwd(), "core/dist");

	app.get("/*", (c) => {
		const urlPath = new URL(c.req.url).pathname;
		let filePath = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);
		// containment check: never serve a file resolved outside distDir (defense in
		// depth — URL parsing already collapses `..`, but this makes it explicit)
		const inDist = path.resolve(filePath).startsWith(path.resolve(distDir) + path.sep);
		if (inDist && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath);
			c.header("Content-Type", MIME[ext] || "application/octet-stream");
			return c.body(fs.readFileSync(filePath));
		}
		c.header("Content-Type", "text/html");
		return c.body(fs.readFileSync(path.join(distDir, "index.html")));
	});
}

const server = serve({
	fetch: app.fetch,
	port: 1118,
});

if (process.env.NODE_ENV === "production") {
	// single-port deployment: socket.io shares the HTTP server so one
	// reverse-proxy forward (e.g. nginx -> server:1118) covers page, API and ws
	io.attach(server as import("node:http").Server);
	log.info("boot", "listening on :1118 — page + /api + socket.io (single port)");
} else {
	// dev: vite proxies /socket.io to this port
	io.listen(1119);
	log.info("boot", "listening on :1118 (api) and :1119 (socket.io) — dev mode");
}

log.info("boot", `ready in ${Date.now() - bootStartedAt}ms`);
log.raw("");

// Periodic heartbeat so `docker compose logs` shows the server is alive and what
// is actually being played, without having to guess from kill spam.
// Set STATUS_INTERVAL_MS=0 to turn it off.
const STATUS_INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS ?? 60000);
if (STATUS_INTERVAL_MS > 0) {
	setInterval(() => {
		const players = rooms.flatMap((r) => r.game.players);
		const humans = players.filter((p) => !p.isBot).length;
		const bots = players.length - humans;
		const busy = rooms
			.filter((r) => r.game.players.some((p) => !p.isBot))
			.map((r) => `${r.name}:${r.game.mode.code} ${r.occupancy()} ${r.game.score.lb}%`);
		const uptime = formatDuration(Date.now() - bootStartedAt);
		log.info(
			"status",
			busy.length > 0
				? `up ${uptime} | ${rooms.length} rooms | ${humans} player(s), ${bots} bots | ${busy.join(" · ")}`
				: `up ${uptime} | ${rooms.length} rooms | idle, no players`,
		);
	}, STATUS_INTERVAL_MS).unref();
}

function shutdown(signal: string) {
	log.info("boot", `${signal} received — shutting down after ${formatDuration(Date.now() - bootStartedAt)}`);
	server.close();
	io.close();
	process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
// docker stop sends SIGTERM; without this the container was killed after the
// 10s grace period instead of closing cleanly
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
	log.error("fatal", `uncaught exception: ${err instanceof Error ? err.stack : String(err)}`);
});
process.on("unhandledRejection", (reason) => {
	log.error("fatal", `unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});
