import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { ClanProfile, PlayerProfile } from "core/src/types.ts";

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

		CREATE TABLE IF NOT EXISTS clans (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			owner_id INTEGER NOT NULL REFERENCES users(id),
			chat_url TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS clan_members (
			clan_id INTEGER NOT NULL REFERENCES clans(id),
			user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
			role TEXT NOT NULL DEFAULT 'member',
			joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (clan_id, user_id)
		);

		CREATE TABLE IF NOT EXISTS user_unlocks (
			user_id INTEGER NOT NULL REFERENCES users(id),
			item_type TEXT NOT NULL,
			item_id INTEGER NOT NULL,
			unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, item_type, item_id)
		);

		CREATE TABLE IF NOT EXISTS user_crates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			source TEXT NOT NULL,
			granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			opened_at DATETIME
		);

		CREATE TABLE IF NOT EXISTS user_quests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id),
			quest_type TEXT NOT NULL,
			quest_key TEXT NOT NULL,
			name TEXT NOT NULL,
			reward_type TEXT NOT NULL,
			reward_amount INTEGER NOT NULL,
			goal INTEGER NOT NULL,
			progress INTEGER NOT NULL DEFAULT 0,
			claimed INTEGER NOT NULL DEFAULT 0,
			period_start TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, quest_type, quest_key, period_start)
		);

		CREATE TABLE IF NOT EXISTS user_login_streak (
			user_id INTEGER PRIMARY KEY REFERENCES users(id),
			streak_day INTEGER NOT NULL DEFAULT 0,
			last_login_date TEXT NOT NULL DEFAULT ''
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

/** All accounts with a linked Discord — the pool "Find Friends" searches. */
export function getDiscordConnectedUsers(): {
	username: string;
	discord_username: string;
	discord_avatar: string;
}[] {
	return getDb()
		.prepare(
			`SELECT username, discord_username, discord_avatar
			 FROM users WHERE discord_id IS NOT NULL`,
		)
		.all() as { username: string; discord_username: string; discord_avatar: string }[];
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

// --- Cosmetics unlock queries ---

export type UnlockItemType = "hat" | "shirt" | "camo";

export function hasUnlock(userId: number, itemType: UnlockItemType, itemId: number): boolean {
	const row = getDb()
		.prepare("SELECT 1 FROM user_unlocks WHERE user_id = ? AND item_type = ? AND item_id = ?")
		.get(userId, itemType, itemId);
	return row !== undefined;
}

/** Returns true if this call newly granted the unlock (false if already owned). */
export function grantUnlock(userId: number, itemType: UnlockItemType, itemId: number): boolean {
	const result = getDb()
		.prepare(
			"INSERT OR IGNORE INTO user_unlocks (user_id, item_type, item_id) VALUES (?, ?, ?)",
		)
		.run(userId, itemType, itemId);
	return result.changes > 0;
}

/** Every item a user owns, for surfacing lock/owned state to the client. */
export function getUserUnlocks(userId: number): { item_type: UnlockItemType; item_id: number }[] {
	return getDb()
		.prepare("SELECT item_type, item_id FROM user_unlocks WHERE user_id = ?")
		.all(userId) as { item_type: UnlockItemType; item_id: number }[];
}

// --- Reward crate queries ---

export function grantCrate(userId: number, source: string): void {
	getDb()
		.prepare("INSERT INTO user_crates (user_id, source) VALUES (?, ?)")
		.run(userId, source);
}

export function getUnopenedCrateCount(userId: number): number {
	const row = getDb()
		.prepare("SELECT COUNT(*) as cnt FROM user_crates WHERE user_id = ? AND opened_at IS NULL")
		.get(userId) as { cnt: number };
	return row.cnt;
}

/** Marks the oldest unopened crate as opened and returns its id/source, or null if none. */
export function popOldestUnopenedCrate(userId: number): { id: number; source: string } | null {
	const run = getDb().transaction(() => {
		const crate = getDb()
			.prepare(
				"SELECT id, source FROM user_crates WHERE user_id = ? AND opened_at IS NULL ORDER BY granted_at ASC LIMIT 1",
			)
			.get(userId) as { id: number; source: string } | undefined;
		if (!crate) return null;
		getDb().prepare("UPDATE user_crates SET opened_at = CURRENT_TIMESTAMP WHERE id = ?").run(crate.id);
		return crate;
	});
	return run();
}

/** Every account's lifetime score, for one-off migration backfills. */
export function getAllUserScores(): { user_id: number; score: number }[] {
	return getDb().prepare("SELECT user_id, score FROM player_stats").all() as {
		user_id: number;
		score: number;
	}[];
}

export function incrementLikes(userId: number): void {
	getDb().prepare("UPDATE player_stats SET likes = likes + 1 WHERE user_id = ?").run(userId);
}

export function decrementLikes(userId: number): void {
	getDb()
		.prepare("UPDATE player_stats SET likes = MAX(0, likes - 1) WHERE user_id = ?")
		.run(userId);
}

// --- Quest queries ---

export type QuestRow = {
	id: number;
	user_id: number;
	quest_type: string;
	quest_key: string;
	name: string;
	reward_type: string;
	reward_amount: number;
	goal: number;
	progress: number;
	claimed: number;
	period_start: string;
};

export function getUserQuestsForPeriod(
	userId: number,
	questType: string,
	periodStart: string,
): QuestRow[] {
	return getDb()
		.prepare(
			"SELECT * FROM user_quests WHERE user_id = ? AND quest_type = ? AND period_start = ?",
		)
		.all(userId, questType, periodStart) as QuestRow[];
}

export function upsertQuest(
	userId: number,
	questType: string,
	questKey: string,
	name: string,
	rewardType: string,
	rewardAmount: number,
	goal: number,
	periodStart: string,
): void {
	getDb()
		.prepare(
			`INSERT INTO user_quests (user_id, quest_type, quest_key, name, reward_type, reward_amount, goal, progress, claimed, period_start)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
			 ON CONFLICT(user_id, quest_type, quest_key, period_start) DO NOTHING`,
		)
		.run(userId, questType, questKey, name, rewardType, rewardAmount, goal, periodStart);
}

export function incrementQuestProgress(userId: number, questKey: string, amount: number, periodStart: string): void {
	getDb()
		.prepare(
			`UPDATE user_quests SET progress = progress + ?
			 WHERE user_id = ? AND quest_key = ? AND period_start = ? AND claimed = 0 AND progress < goal`,
		)
		.run(amount, userId, questKey, periodStart);
}

export function claimQuest(questId: number, userId: number): QuestRow | null {
	const run = getDb().transaction(() => {
		const quest = getDb()
			.prepare("SELECT * FROM user_quests WHERE id = ? AND user_id = ? AND claimed = 0")
			.get(questId, userId) as QuestRow | undefined;
		if (!quest) return null;
		if (quest.progress < quest.goal) return null;
		getDb()
			.prepare("UPDATE user_quests SET claimed = 1 WHERE id = ?")
			.run(questId);
		return quest;
	});
	return run();
}

// --- Login streak queries ---

export function getLoginStreak(userId: number): { streak_day: number; last_login_date: string } {
	const row = getDb()
		.prepare("SELECT streak_day, last_login_date FROM user_login_streak WHERE user_id = ?")
		.get(userId) as { streak_day: number; last_login_date: string } | undefined;
	return row ?? { streak_day: 0, last_login_date: "" };
}

export function updateLoginStreak(userId: number, newDay: number, todayStr: string): void {
	const existing = getDb()
		.prepare("SELECT 1 FROM user_login_streak WHERE user_id = ?")
		.get(userId);
	if (existing) {
		getDb()
			.prepare("UPDATE user_login_streak SET streak_day = ?, last_login_date = ? WHERE user_id = ?")
			.run(newDay, todayStr, userId);
	} else {
		getDb()
			.prepare("INSERT INTO user_login_streak (user_id, streak_day, last_login_date) VALUES (?, ?, ?)")
			.run(userId, newDay, todayStr);
	}
}

export function claimStreakReward(userId: number): void {
	getDb()
		.prepare("UPDATE user_login_streak SET streak_day = 0 WHERE user_id = ?")
		.run(userId);
}

export function incrementBonusScore(userId: number, amount: number): void {
	getDb()
		.prepare("UPDATE player_stats SET score = score + ? WHERE user_id = ?")
		.run(amount, userId);
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

function computeHatCounts(): Map<number, number> {
	const rows = getDb()
		.prepare(
			"SELECT user_id, COUNT(*) as cnt FROM user_unlocks WHERE item_type = 'hat' GROUP BY user_id",
		)
		.all() as { user_id: number; cnt: number }[];
	const countMap = new Map<number, number>();
	for (const row of rows) {
		countMap.set(row.user_id, row.cnt);
	}
	return countMap;
}

function countUserHats(userId: number): number {
	const row = getDb()
		.prepare("SELECT COUNT(*) as cnt FROM user_unlocks WHERE user_id = ? AND item_type = 'hat'")
		.get(userId) as { cnt: number };
	return row.cnt;
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
	numHats: number,
): PlayerProfile {
	const kdr = Math.round((row.kills / Math.max(1, row.deaths)) * 100) / 100;
	const membership = findUserClanMembership(row.user_id);
	return {
		name: row.username,
		worldRank,
		rank: Math.floor(row.score / 1000),
		score: row.score,
		kdr,
		numKills: row.kills,
		numDeaths: row.deaths,
		numLikes: row.likes,
		numHats,
		clan: membership?.name,
	};
}

export function getLeaderboard(
	sortBy: "score" | "kdr" | "kills",
	limit: number,
	minKills?: number,
): PlayerProfile[] {
	const worldRanks = computeWorldRanks();
	const hatCounts = computeHatCounts();
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
	const params: number[] = [];
	if (minKills !== undefined) {
		query += ` WHERE ps.kills >= ?`;
		params.push(minKills);
	}
	// orderBy is built above only from a hardcoded switch, never from raw
	// caller input, so it's safe to interpolate; limit is still bound
	query += ` ORDER BY ${orderBy} LIMIT ?`;
	params.push(limit);

	const rows = getDb().prepare(query).all(...params) as {
		user_id: number;
		username: string;
		score: number;
		kills: number;
		deaths: number;
		likes: number;
	}[];

	return rows.map((row) =>
		rowToProfile(row, worldRanks.get(row.user_id) ?? 0, hatCounts.get(row.user_id) ?? 0),
	);
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
	const membership = findUserClanMembership(user.id);

	return {
		name: user.username,
		clan: membership?.name ?? null,
		rank: Math.floor(stats.score / 1000),
		worldRank,
		score: stats.score,
		kdr,
		kills: stats.kills,
		deaths: stats.deaths,
		likes: stats.likes,
		numHats: countUserHats(user.id),
		avatar: user.discord_avatar || null,
	};
}

// --- Clan queries ---

export function findClanByName(name: string) {
	return getDb().prepare("SELECT * FROM clans WHERE name = ?").get(name.toUpperCase()) as
		| { id: number; name: string; owner_id: number; chat_url: string }
		| undefined;
}

export function findUserClanMembership(userId: number) {
	return getDb()
		.prepare(
			`SELECT c.id, c.name, c.owner_id, c.chat_url, cm.role
			 FROM clan_members cm JOIN clans c ON c.id = cm.clan_id
			 WHERE cm.user_id = ?`,
		)
		.get(userId) as
		| { id: number; name: string; owner_id: number; chat_url: string; role: "owner" | "member" }
		| undefined;
}

/** Creates a clan and makes the given user its owner, in one transaction. */
export function createClan(name: string, ownerId: number): { id: number; name: string } | null {
	const normalized = name.toUpperCase();
	const run = getDb().transaction(() => {
		const result = getDb()
			.prepare("INSERT INTO clans (name, owner_id) VALUES (?, ?)")
			.run(normalized, ownerId);
		const clanId = Number(result.lastInsertRowid);
		getDb()
			.prepare("INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, 'owner')")
			.run(clanId, ownerId);
		return clanId;
	});
	try {
		const clanId = run();
		return { id: clanId, name: normalized };
	} catch {
		// UNIQUE constraint on clans.name, or user already has a clan_members row
		return null;
	}
}

export function addClanMember(clanId: number, userId: number, role: "owner" | "member" = "member"): boolean {
	try {
		getDb()
			.prepare("INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, ?)")
			.run(clanId, userId, role);
		return true;
	} catch {
		return false;
	}
}

export function removeClanMember(userId: number): void {
	getDb().prepare("DELETE FROM clan_members WHERE user_id = ?").run(userId);
}

export function deleteClan(clanId: number): void {
	const run = getDb().transaction(() => {
		getDb().prepare("DELETE FROM clan_members WHERE clan_id = ?").run(clanId);
		getDb().prepare("DELETE FROM clans WHERE id = ?").run(clanId);
	});
	run();
}

export function updateClanChatUrl(clanId: number, chatUrl: string): void {
	getDb().prepare("UPDATE clans SET chat_url = ? WHERE id = ?").run(chatUrl, clanId);
}

/** Roster + aggregate stats for a clan's in-account display panel. */
export function getClanStats(clanId: number): {
	founder: string;
	members: string[];
	rank: number;
	kd: number;
	chatURL: string;
} | null {
	const clan = getDb().prepare("SELECT * FROM clans WHERE id = ?").get(clanId) as
		| { id: number; name: string; owner_id: number; chat_url: string }
		| undefined;
	if (!clan) return null;

	const rows = getDb()
		.prepare(
			`SELECT u.username, cm.role, ps.score, ps.kills, ps.deaths
			 FROM clan_members cm
			 JOIN users u ON u.id = cm.user_id
			 LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
			 WHERE cm.clan_id = ?`,
		)
		.all(clanId) as { username: string; role: string; score: number | null; kills: number | null; deaths: number | null }[];

	const founder = rows.find((r) => r.role === "owner")?.username ?? "";
	const totalScore = rows.reduce((sum, r) => sum + (r.score ?? 0), 0);
	const totalKills = rows.reduce((sum, r) => sum + (r.kills ?? 0), 0);
	const totalDeaths = rows.reduce((sum, r) => sum + (r.deaths ?? 0), 0);
	const avgScore = rows.length > 0 ? totalScore / rows.length : 0;

	return {
		founder,
		members: rows.map((r) => r.username),
		rank: Math.floor(avgScore / 1000),
		kd: Math.round((totalKills / Math.max(1, totalDeaths)) * 100) / 100,
		chatURL: clan.chat_url,
	};
}

export function getClanLeaderboard(sortBy: "rank" | "kdr", limit: number): ClanProfile[] {
	const rows = getDb()
		.prepare(
			`SELECT c.id, c.name, c.owner_id, u.username as owner_name,
				COUNT(cm.user_id) as num_members,
				COALESCE(AVG(ps.score), 0) as avg_score,
				COALESCE(SUM(ps.kills), 0) as total_kills,
				COALESCE(SUM(ps.deaths), 0) as total_deaths
			 FROM clans c
			 JOIN users u ON u.id = c.owner_id
			 LEFT JOIN clan_members cm ON cm.clan_id = c.id
			 LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
			 GROUP BY c.id`,
		)
		.all() as {
		id: number;
		name: string;
		owner_name: string;
		num_members: number;
		avg_score: number;
		total_kills: number;
		total_deaths: number;
	}[];

	const withComputed = rows.map((r) => ({
		id: r.id,
		name: r.name,
		rank: Math.floor(r.avg_score / 1000),
		kdr: Math.round((r.total_kills / Math.max(1, r.total_deaths)) * 100) / 100,
		owner: r.owner_name,
		numMembers: r.num_members,
	}));

	const sorted =
		sortBy === "kdr"
			? withComputed.toSorted((a, b) => b.kdr - a.kdr)
			: withComputed.toSorted((a, b) => b.rank - a.rank);

	return sorted.slice(0, limit).map((c, i) => ({ ...c, position: i + 1 }));
}
