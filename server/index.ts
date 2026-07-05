import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { Server, type Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gameModes } from "core/src/gamemodes.ts";
import { Room, rooms } from "./room.ts";
import { createRateLimiter, createConnectionLimiter } from "./security.ts";
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
} from "./db.ts";
import { validateSession } from "./session.ts";
import { checkForNewUnlocks, getUserUnlockedItems } from "./unlocks.ts";
import {
	setupAuthHandlers,
	setupProfileHandler,
	attachSocketSession,
	emitAccountStats,
	emitUnlocks,
	type AuthenticatedSocket,
} from "./auth.ts";
import { createOAuthRoutes } from "./oauth.ts";

initDb();

// one-off backfill: unlock whatever every existing account's current lifetime
// score already qualifies for, so switching on enforcement doesn't suddenly
// lock people out of cosmetics they were already using freely
for (const { user_id, score } of getAllUserScores()) {
	checkForNewUnlocks(user_id, score);
}

const allowedOrigins = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
	: ["http://localhost:4173", "http://localhost:5173", "http://localhost:1118"];

if (process.env.NODE_ENV === "production" && allowedOrigins.includes("*")) {
	throw new Error("CORS_ORIGINS must not contain '*' in production");
}

const createRoomLimiter = createRateLimiter(3, 60000);
const profileLimiter = createRateLimiter(30, 60000);
const connectionLimiter = createConnectionLimiter(5);

const io = new Server({
	cors: {
		origin: allowedOrigins,
		methods: ["GET"],
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

io.use((socket, next) => {
	const ip = socket.handshake.address ?? "unknown";
	if (!connectionLimiter.increment(ip)) {
		return next(new Error("Too many connections"));
	}
	socket.on("disconnect", () => connectionLimiter.decrement(ip));
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
	setupAuthHandlers(socket as AuthenticatedSocket);
	setupProfileHandler(socket);
	// If session cookie validated, emit account data + owned cosmetics automatically
	emitAccountStats(socket as AuthenticatedSocket);
	emitUnlocks(socket as AuthenticatedSocket);
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

api.get("/getIP", (c) => {
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
	const clientIp = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
	if (!createRoomLimiter(clientIp)) {
		return c.json({ error: "Rate limit exceeded" }, 429);
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

	return c.json({ room: code, hostSecret, mapRejected: !mapAccepted });
});

api.get("/getRooms", (c) => {
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
	const clientIp = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
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

// root app: API mounted under /api, static files (production) at /
const app = new Hono();
app.route("/api", api);

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
		const parts = range.replace(/bytes=/, "").split("-");
		const start = Number.parseInt(parts[0], 10);
		const end = parts[1] ? Number.parseInt(parts[1], 10) : stat.size - 1;
		const chunkSize = end - start + 1;
		const buffer = Buffer.alloc(chunkSize);
		const fd = fs.openSync(filePath, "r");
		fs.readSync(fd, buffer, 0, chunkSize, start);
		fs.closeSync(fd);
		c.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
		c.header("Content-Length", chunkSize.toString());
		c.header("Content-Type", contentType);
		c.header("Accept-Ranges", "bytes");
		return c.body(buffer, 206);
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
} else {
	// dev: vite proxies /socket.io to this port
	io.listen(1119);
}

process.on("SIGINT", () => {
	server.close();
	io.close();
	process.exit(0);
});
