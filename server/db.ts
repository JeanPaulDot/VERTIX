import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { PlayerProfile } from "core/src/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR;
const DB_PATH = DATA_DIR
	? path.join(DATA_DIR, "vertix.db")
	: path.join(__dirname, "vertix.db");

let db: Database.Database;

export function initDb(): void {
	db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			email TEXT NOT NULL DEFAULT '',
			password_hash TEXT NOT NULL DEFAULT '',
			discord_id TEXT,
			discord_username TEXT DEFAULT '',
			discord_avatar TEXT DEFAULT '',
			hat_id INTEGER DEFAULT 0,
			shirt_id INTEGER DEFAULT 0,
			channel TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS player_stats (
			user_id INTEGER PRIMARY KEY REFERENCES users(id),
			score INTEGER DEFAULT 0,
			kills INTEGER DEFAULT 0,
			deaths INTEGER DEFAULT 0,
			total_damage INTEGER DEFAULT 0,
			total_healing INTEGER DEFAULT 0,
			total_goals INTEGER DEFAULT 0,
			likes INTEGER DEFAULT 0
		);
	`);

	// Migration: add discord columns if missing
	const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
	const colNames = columns.map((c) => c.name);
	if (!colNames.includes("discord_id")) {
		db.exec("ALTER TABLE users ADD COLUMN discord_id TEXT");
	}
	if (!colNames.includes("discord_username")) {
		db.exec("ALTER TABLE users ADD COLUMN discord_username TEXT DEFAULT ''");
	}
	if (!colNames.includes("discord_avatar")) {
		db.exec("ALTER TABLE users ADD COLUMN discord_avatar TEXT DEFAULT ''");
	}
	// Create unique index on discord_id if it doesn't exist
	const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_discord_id'").all();
	if (indexes.length === 0) {
		db.exec("CREATE UNIQUE INDEX idx_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL");
	}
}

export function getDb(): Database.Database {
	if (!db) throw new Error("Database not initialized. Call initDb() first.");
	return db;
}

// --- User queries ---

export function createUser(
	username: string,
	email: string,
	passwordHash: string,
): { id: number; username: string } {
	const stmt = getDb().prepare(
		"INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
	);
	const result = stmt.run(username, email, passwordHash);
	return { id: Number(result.lastInsertRowid), username };
}

export function findUserByUsername(username: string) {
	return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as
		| {
				id: number;
				username: string;
				email: string;
				password_hash: string;
				hat_id: number;
				shirt_id: number;
				channel: string;
				created_at: string;
		  }
		| undefined;
}

export function findUserByEmail(email: string) {
	return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as
		| {
				id: number;
				username: string;
				email: string;
				password_hash: string;
		  }
		| undefined;
}

export function findUserById(id: number) {
	return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
		| {
				id: number;
				username: string;
				email: string;
				password_hash: string;
				discord_id: string | null;
				discord_username: string;
				discord_avatar: string;
				channel: string;
		  }
		| undefined;
}

export function findUserByDiscordId(discordId: string) {
	return getDb().prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId) as
		| {
				id: number;
				username: string;
				email: string;
				password_hash: string;
				discord_id: string;
				discord_username: string;
				discord_avatar: string;
		  }
		| undefined;
}

export function createDiscordUser(data: {
	discordId: string;
	discordUsername: string;
	discordAvatar: string;
	username: string;
}): { id: number; username: string } {
	const stmt = getDb().prepare(
		`INSERT INTO users (username, discord_id, discord_username, discord_avatar)
		 VALUES (?, ?, ?, ?)`,
	);
	const result = stmt.run(data.username, data.discordId, data.discordUsername, data.discordAvatar);
	return { id: Number(result.lastInsertRowid), username: data.username };
}

// --- Stats queries ---

export function getUserStats(userId: number) {
	return getDb().prepare("SELECT * FROM player_stats WHERE user_id = ?").get(userId) as
		| {
				user_id: number;
				score: number;
				kills: number;
				deaths: number;
				total_damage: number;
				total_healing: number;
				total_goals: number;
				likes: number;
		  }
		| undefined;
}

export function createEmptyStats(userId: number): void {
	getDb().prepare("INSERT INTO player_stats (user_id) VALUES (?)").run(userId);
}

export function saveRoundStats(
	userId: number,
	data: {
		kills: number;
		deaths: number;
		score: number;
		damage: number;
		healing: number;
		goals: number;
	},
): void {
	const existing = getUserStats(userId);
	if (!existing) {
		createEmptyStats(userId);
	}
	getDb()
		.prepare(
			`UPDATE player_stats SET
				score = score + ?,
				kills = kills + ?,
				deaths = deaths + ?,
				total_damage = total_damage + ?,
				total_healing = total_healing + ?,
				total_goals = total_goals + ?
			WHERE user_id = ?`,
		)
		.run(data.score, data.kills, data.deaths, data.damage, data.healing, data.goals, userId);
}

export function incrementLikes(userId: number): void {
	getDb().prepare("UPDATE player_stats SET likes = likes + 1 WHERE user_id = ?").run(userId);
}

export function decrementLikes(userId: number): void {
	getDb()
		.prepare("UPDATE player_stats SET likes = MAX(0, likes - 1) WHERE user_id = ?")
		.run(userId);
}

// --- Leaderboard queries ---

function computeWorldRanks(): Map<number, number> {
	const rows = getDb()
		.prepare("SELECT user_id, score FROM player_stats ORDER BY score DESC")
		.all() as { user_id: number; score: number }[];
	const rankMap = new Map<number, number>();
	for (let i = 0; i < rows.length; i++) {
		rankMap.set(rows[i].user_id, i + 1);
	}
	return rankMap;
}

function rowToProfile(
	row: {
		user_id: number;
		username: string;
		score: number;
		kills: number;
		deaths: number;
		likes: number;
	},
	worldRank: number,
): PlayerProfile {
	const kdr = Math.round((row.kills / Math.max(1, row.deaths)) * 100) / 100;
	return {
		name: row.username,
		worldRank,
		rank: Math.floor(row.score / 1000),
		score: row.score,
		kdr,
		numKills: row.kills,
		numDeaths: row.deaths,
		numLikes: row.likes,
		numHats: 0,
	};
}

export function getLeaderboard(
	sortBy: "score" | "kdr" | "kills",
	limit: number,
	minKills?: number,
): PlayerProfile[] {
	const worldRanks = computeWorldRanks();
	let orderBy: string;
	if (sortBy === "kdr") {
		orderBy = "CAST(ps.kills AS REAL) / MAX(1, ps.deaths) DESC";
	} else {
		orderBy = `ps.${sortBy} DESC`;
	}

	let query = `
		SELECT u.id as user_id, u.username, ps.score, ps.kills, ps.deaths, ps.likes
		FROM player_stats ps
		JOIN users u ON u.id = ps.user_id
	`;
	if (minKills !== undefined) {
		query += ` WHERE ps.kills >= ${minKills}`;
	}
	query += ` ORDER BY ${orderBy} LIMIT ${limit}`;

	const rows = getDb().prepare(query).all() as {
		user_id: number;
		username: string;
		score: number;
		kills: number;
		deaths: number;
		likes: number;
	}[];

	return rows.map((row) => rowToProfile(row, worldRanks.get(row.user_id) ?? 0));
}

// --- Profile query ---

export function getProfile(username: string) {
	const user = findUserByUsername(username);
	if (!user) return null;

	const stats = getUserStats(user.id);
	if (!stats) return null;

	const worldRanks = computeWorldRanks();
	const worldRank = worldRanks.get(user.id) ?? 0;
	const kdr = Math.round((stats.kills / Math.max(1, stats.deaths)) * 100) / 100;

	return {
		name: user.username,
		clan: null,
		rank: Math.floor(stats.score / 1000),
		worldRank,
		score: stats.score,
		kdr,
		kills: stats.kills,
		deaths: stats.deaths,
		likes: stats.likes,
		numHats: 0,
	};
}
