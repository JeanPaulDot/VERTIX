import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server, type Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gameModes } from "core/src/gamemodes.ts";
import type { ClanProfile } from "core/src/types.ts";
import { Room, rooms } from "./room.ts";
import { createRateLimiter, createConnectionLimiter } from "./security.ts";
import { initDb, getLeaderboard, getProfile } from "./db.ts";
import {
	setupAuthHandlers,
	setupProfileHandler,
	attachSocketSession,
	emitAccountStats,
	type AuthenticatedSocket,
} from "./auth.ts";
import { createOAuthRoutes } from "./oauth.ts";

initDb();

const allowedOrigins = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",")
	: ["http://localhost:4173", "http://localhost:5173", "http://localhost:1118"];

const createRoomLimiter = createRateLimiter(3, 60000);
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

io.on("connection", (socket: Socket) => {
	setupAuthHandlers(socket as AuthenticatedSocket);
	setupProfileHandler(socket);
	// If session cookie validated, emit account data automatically
	emitAccountStats(socket as AuthenticatedSocket);
});

const api = new Hono();

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
	room.configure({
		...data,
		srvModes:
			data.srvModes?.length > 0 ? data.srvModes : [gameModes.findIndex((m) => m.code === "ffa")],
	});
	rooms.push(room);
	room.handleSocket();

	return c.json({ room: code, hostSecret });
});

api.get("/getRooms", (c) => {
	const list = rooms.map((r) => ({
		n: r.name,
		m: r.game.mode.code,
		pl: r.game.players.length,
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
		clanRank: [] as ClanProfile[],
		clanKdr: [] as ClanProfile[],
	});
});

api.get("/profile/:username", (c) => {
	const profile = getProfile(c.req.param("username"));
	if (!profile) return c.json({ error: "Player not found" }, 404);
	return c.json(profile);
});

// root app: API mounted under /api, static files (production) at /
const app = new Hono();
app.route("/api", api);

// Production: serve frontend static files
if (process.env.NODE_ENV === "production") {
	const distDir = path.resolve(process.cwd(), "core/dist");
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
	};

	app.get("/*", (c) => {
		const urlPath = new URL(c.req.url).pathname;
		let filePath = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
