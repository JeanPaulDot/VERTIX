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
			session_version INTEGER NOT NULL DEFAULT 0,
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

		CREATE TABLE IF NOT EXISTS bug_reports (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			message TEXT NOT NULL,
			username TEXT DEFAULT '',
			room TEXT DEFAULT '',
			mode TEXT DEFAULT '',
			user_agent TEXT DEFAULT '',
			ip TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id INTEGER,
			username TEXT NOT NULL,
			ip TEXT NOT NULL,
			user_agent TEXT DEFAULT '',
			room TEXT DEFAULT '',
			mode TEXT DEFAULT '',
			started_at INTEGER NOT NULL,
			ended_at INTEGER,
			duration_seconds INTEGER DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
		CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip);
		CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

		-- moderation: same shape for bans (cannot join at all) and mutes (cannot
		-- chat). value is the userId as a string for kind='user', or the IP for
		-- kind='ip'. expires_at NULL = permanent. Lifted rows stay for the audit
		-- trail; lookups filter on active.
		CREATE TABLE IF NOT EXISTS bans (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			kind TEXT NOT NULL CHECK (kind IN ('user', 'ip')),
			value TEXT NOT NULL,
			reason TEXT NOT NULL DEFAULT '',
			issued_by TEXT NOT NULL DEFAULT '',
			issued_at INTEGER NOT NULL,
			expires_at INTEGER,
			active INTEGER NOT NULL DEFAULT 1,
			lifted_at INTEGER,
			lifted_by TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_bans_subject ON bans(kind, value, active);

		CREATE TABLE IF NOT EXISTS mutes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			kind TEXT NOT NULL CHECK (kind IN ('user', 'ip')),
			value TEXT NOT NULL,
			reason TEXT NOT NULL DEFAULT '',
			issued_by TEXT NOT NULL DEFAULT '',
			issued_at INTEGER NOT NULL,
			expires_at INTEGER,
			active INTEGER NOT NULL DEFAULT 1,
			lifted_at INTEGER,
			lifted_by TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_mutes_subject ON mutes(kind, value, active);

		-- every mutating admin action writes a row here; the panel is read-only
		-- history, so there is no delete/update path at all
		CREATE TABLE IF NOT EXISTS admin_audit (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			actor TEXT NOT NULL,
			action TEXT NOT NULL,
			target TEXT NOT NULL DEFAULT '',
			payload TEXT,
			ip TEXT DEFAULT '',
			created_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);

		-- bounded chat history for abuse reports; pruned by analytics on write
		CREATE TABLE IF NOT EXISTS chat_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room TEXT NOT NULL DEFAULT '',
			user_id INTEGER,
			username TEXT NOT NULL DEFAULT '',
			ip TEXT DEFAULT '',
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_chat_log_created ON chat_log(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_chat_log_room ON chat_log(room);

		-- one row per minute from the concurrency sampler in index.ts
		CREATE TABLE IF NOT EXISTS server_stats (
			ts INTEGER PRIMARY KEY,
			humans INTEGER NOT NULL,
			bots INTEGER NOT NULL,
			rooms INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS user_activity (
			user_id INTEGER PRIMARY KEY,
			first_seen INTEGER NOT NULL,
			last_seen INTEGER NOT NULL,
			session_count INTEGER NOT NULL DEFAULT 0,
			play_time_seconds INTEGER NOT NULL DEFAULT 0,
			last_ip TEXT DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS user_ips (
			username TEXT NOT NULL,
			ip TEXT NOT NULL,
			first_seen INTEGER NOT NULL,
			last_seen INTEGER NOT NULL,
			count INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (username, ip)
		);
		CREATE INDEX IF NOT EXISTS idx_user_ips_ip ON user_ips(ip);

		-- Leaderboard ordering. getLeaderboard sorts player_stats by score/kills and
		-- getWorldRank scans the whole table by score, both of which were full scans
		-- plus a sort; these let SQLite walk the index and stop at LIMIT.
		CREATE INDEX IF NOT EXISTS idx_player_stats_score ON player_stats(score DESC);
		CREATE INDEX IF NOT EXISTS idx_player_stats_kills ON player_stats(kills DESC);
		-- getUnopenedCrateCount / popOldestUnopenedCrate filter on both columns
		CREATE INDEX IF NOT EXISTS idx_user_crates_user_open ON user_crates(user_id, opened_at);
		-- clan ownership checks (findClanByName -> owner_id) and the clan leaderboard
		CREATE INDEX IF NOT EXISTS idx_clans_owner ON clans(owner_id);
		-- quest lookups are per user per period
		CREATE INDEX IF NOT EXISTS idx_user_quests_user_period
			ON user_quests(user_id, period_start);
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
	if (!colNames.includes("session_version")) {
		db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0");
	}
	// role: player (default) | mod | admin — lets moderators act under their own
	// Discord account instead of sharing the break-glass ADMIN_TOKEN
	if (!colNames.includes("role")) {
		db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
	}
	const bugColumns = db.prepare("PRAGMA table_info(bug_reports)").all() as { name: string }[];
	if (!bugColumns.map((c) => c.name).includes("status")) {
		db.exec("ALTER TABLE bug_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'");
	}
	const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
	if (!sessionColumns.map((c) => c.name).includes("mode")) {
		db.exec("ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT ''");
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

/**
 * One row of the `users` table. All three lookups below are `SELECT *`, so they
 * all return this same shape — declaring narrower per-function types is what made
 * getProfile unable to see discord_avatar and left createDiscordUser's result
 * incompatible with findUserByDiscordId's.
 *
 * `email` / `password_hash` are vestigial: login has been Discord-only since the
 * password auth was removed, but the columns remain for the old rows.
 */
export type UserRow = {
	id: number;
	username: string;
	email: string;
	password_hash: string;
	discord_id: string | null;
	discord_username: string;
	discord_avatar: string;
	hat_id: number;
	shirt_id: number;
	channel: string;
	session_version: number;
	role: "player" | "mod" | "admin";
	created_at: string;
};

export function findUserByUsername(username: string): UserRow | undefined {
	return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as
		| UserRow
		| undefined;
}

export function findUserById(id: number): UserRow | undefined {
	return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function findUserByDiscordId(discordId: string): UserRow | undefined {
	return getDb().prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId) as
		| UserRow
		| undefined;
}

/** Current session version for a user — bumping it invalidates every issued JWT. */
export function getSessionVersion(userId: number): number {
	const row = getDb()
		.prepare("SELECT session_version FROM users WHERE id = ?")
		.get(userId) as { session_version: number } | undefined;
	return row?.session_version ?? 0;
}

/** Increments the session version, revoking all outstanding sessions for the user. */
export function bumpSessionVersion(userId: number): void {
	getDb().prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?").run(userId);
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

/**
 * Creates a Discord-linked account and its empty stats row in one transaction,
 * returning the full row. The stats row matters: getProfile and
 * buildAccountPayload both return null without one, so an account created
 * without it has no profile page and no account chip.
 */
export function createDiscordUser(data: {
	discordId: string;
	discordUsername: string;
	discordAvatar: string;
	username: string;
}): UserRow {
	const run = getDb().transaction(() => {
		const result = getDb()
			.prepare(
				`INSERT INTO users (username, discord_id, discord_username, discord_avatar)
				 VALUES (?, ?, ?, ?)`,
			)
			.run(data.username, data.discordId, data.discordUsername, data.discordAvatar);
		const id = Number(result.lastInsertRowid);
		getDb().prepare("INSERT OR IGNORE INTO player_stats (user_id) VALUES (?)").run(id);
		return id;
	});
	const id = run();
	return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
}

/** Case-insensitive username lookup, for uniqueness checks on profile edits. */
export function findUserByUsernameInsensitive(username: string): UserRow | undefined {
	return getDb()
		.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
		.get(username) as UserRow | undefined;
}

/** Applies a profile edit. Returns false if the username is already taken. */
export function updateUserProfile(userId: number, username: string, channel: string): boolean {
	try {
		getDb()
			.prepare("UPDATE users SET username = ?, channel = ? WHERE id = ?")
			.run(username, channel, userId);
		return true;
	} catch {
		return false; // UNIQUE constraint on users.username
	}
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

/**
 * Puts a popped crate back in the unopened pile. Used when the roll that follows
 * a pop yields nothing (the account already owns every cosmetic), which would
 * otherwise consume the crate and hand back no reward.
 */
export function restoreCrate(crateId: number): void {
	getDb().prepare("UPDATE user_crates SET opened_at = NULL WHERE id = ?").run(crateId);
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

// quest_type is part of the WHERE because the daily and weekly period_start
// strings are identical on Mondays — without it, the weekly pass would increment
// the day's daily rows a second time.
export function incrementQuestProgress(
	userId: number,
	questType: string,
	questKey: string,
	amount: number,
	periodStart: string,
): void {
	getDb()
		.prepare(
			`UPDATE user_quests SET progress = progress + ?
			 WHERE user_id = ? AND quest_type = ? AND quest_key = ? AND period_start = ? AND claimed = 0 AND progress < goal`,
		)
		.run(amount, userId, questType, questKey, periodStart);
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

/**
 * One account's world rank: how many players out-score them, plus one.
 *
 * Deliberately not computeWorldRanks(): that materialises every row and is fine
 * for a leaderboard page, but this is called on every account-stats push (round
 * end, login, room switch) and only needs a single aggregate.
 */
export function getWorldRank(userId: number): number {
	const row = getDb()
		.prepare(
			"SELECT COUNT(*) AS ahead FROM player_stats WHERE score > (SELECT score FROM player_stats WHERE user_id = ?)",
		)
		.get(userId) as { ahead: number } | undefined;
	return (row?.ahead ?? 0) + 1;
}

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

// --- Bug reports ---

export type BugReportRow = {
	id: number;
	message: string;
	username: string;
	room: string;
	mode: string;
	user_agent: string;
	ip: string;
	created_at: string;
};

export function createBugReport(data: {
	message: string;
	username: string;
	room: string;
	mode: string;
	userAgent: string;
	ip: string;
}): void {
	getDb()
		.prepare(
			"INSERT INTO bug_reports (message, username, room, mode, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run(data.message, data.username, data.room, data.mode, data.userAgent, data.ip);
}

export function getRecentBugReports(limit: number): BugReportRow[] {
	return getDb()
		.prepare("SELECT * FROM bug_reports ORDER BY id DESC LIMIT ?")
		.all(limit) as BugReportRow[];
}

export function deleteBugReport(id: number): void {
	getDb().prepare("DELETE FROM bug_reports WHERE id = ?").run(id);
}

/** Mark a bug report resolved instead of deleting it — reports are history too. */
export function resolveBugReport(id: number): void {
	getDb().prepare("UPDATE bug_reports SET status = 'resolved' WHERE id = ?").run(id);
}

// --- Moderation: bans & mutes ----------------------------------------------

export type SanctionRow = {
	id: number;
	kind: "user" | "ip";
	value: string;
	reason: string;
	issued_by: string;
	issued_at: number;
	expires_at: number | null;
	active: number;
	lifted_at: number | null;
	lifted_by: string | null;
};

/** Sanctions joined with the username, when the subject is an account. */
export type SanctionWithUser = SanctionRow & { username: string | null };

function getActiveSanction(
	table: "bans" | "mutes",
	kind: "user" | "ip",
	value: string,
): SanctionRow | null {
	return (
		(getDb()
			.prepare(
				`SELECT * FROM ${table} WHERE kind = ? AND value = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY issued_at DESC LIMIT 1`,
			)
			.get(kind, value, Date.now()) as SanctionRow | undefined) ?? null
	);
}

export function getActiveBanForUser(userId: number): SanctionRow | null {
	return getActiveSanction("bans", "user", String(userId));
}

export function getActiveBanForIp(ip: string): SanctionRow | null {
	return getActiveSanction("bans", "ip", ip);
}

/** The ban that should block this join, if any — account first, then IP. */
export function getActiveBanFor(userId: number | null, ip: string | null): SanctionRow | null {
	if (userId != null) {
		const ban = getActiveBanForUser(userId);
		if (ban) return ban;
	}
	if (ip) return getActiveBanForIp(ip);
	return null;
}

export function getActiveMuteFor(userId: number | null, ip: string | null): SanctionRow | null {
	if (userId != null) {
		const mute = getActiveSanction("mutes", "user", String(userId));
		if (mute) return mute;
	}
	if (ip) return getActiveSanction("mutes", "ip", ip);
	return null;
}

function issueSanction(
	table: "bans" | "mutes",
	sanction: { kind: "user" | "ip"; value: string; reason: string; issuedBy: string; expiresAt: number | null },
): void {
	const now = Date.now();
	const run = getDb().transaction(() => {
		// deactivate any previous active sanction on the same subject so the list
		// shows one live row per subject rather than a stack of superseded ones
		getDb()
			.prepare(
				`UPDATE ${table} SET active = 0, lifted_at = ?, lifted_by = 'superseded' WHERE kind = ? AND value = ? AND active = 1`,
			)
			.run(now, sanction.kind, sanction.value);
		getDb()
			.prepare(
				`INSERT INTO ${table} (kind, value, reason, issued_by, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				sanction.kind,
				sanction.value,
				sanction.reason,
				sanction.issuedBy,
				now,
				sanction.expiresAt,
			);
	});
	run();
}

export function issueBan(sanction: {
	kind: "user" | "ip";
	value: string;
	reason: string;
	issuedBy: string;
	expiresAt: number | null;
}): void {
	issueSanction("bans", sanction);
}

export function issueMute(sanction: {
	kind: "user" | "ip";
	value: string;
	reason: string;
	issuedBy: string;
	expiresAt: number | null;
}): void {
	issueSanction("mutes", sanction);
}

function liftSanction(table: "bans" | "mutes", kind: "user" | "ip", value: string, by: string): boolean {
	const result = getDb()
		.prepare(
			`UPDATE ${table} SET active = 0, lifted_at = ?, lifted_by = ? WHERE kind = ? AND value = ? AND active = 1`,
		)
		.run(Date.now(), by, kind, value);
	return result.changes > 0;
}

export function liftBan(kind: "user" | "ip", value: string, by: string): boolean {
	return liftSanction("bans", kind, value, by);
}

export function liftMute(kind: "user" | "ip", value: string, by: string): boolean {
	return liftSanction("mutes", kind, value, by);
}

function listActiveSanctions(table: "bans" | "mutes"): SanctionWithUser[] {
	return getDb()
		.prepare(
			`SELECT s.*, u.username FROM ${table} s
				LEFT JOIN users u ON s.kind = 'user' AND u.id = CAST(s.value AS INTEGER)
				WHERE s.active = 1 ORDER BY s.issued_at DESC LIMIT 500`,
		)
		.all() as SanctionWithUser[];
}

export function listActiveBans(): SanctionWithUser[] {
	return listActiveSanctions("bans");
}

export function listActiveMutes(): SanctionWithUser[] {
	return listActiveSanctions("mutes");
}

// --- Roles ------------------------------------------------------------------

export function getUserRole(userId: number): "player" | "mod" | "admin" {
	const row = getDb().prepare("SELECT role FROM users WHERE id = ?").get(userId) as
		| { role: string }
		| undefined;
	if (row?.role === "mod" || row?.role === "admin") return row.role;
	return "player";
}

export function setUserRole(userId: number, role: "player" | "mod" | "admin"): void {
	getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
}

// --- Admin audit -------------------------------------------------------------

export function writeAudit(entry: {
	actor: string;
	action: string;
	target: string;
	payload?: string;
	ip: string;
}): void {
	getDb()
		.prepare(
			"INSERT INTO admin_audit (actor, action, target, payload, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run(entry.actor, entry.action, entry.target, entry.payload ?? null, entry.ip, Date.now());
}

export function getRecentAudit(limit: number, offset: number): unknown[] {
	return getDb()
		.prepare("SELECT * FROM admin_audit ORDER BY id DESC LIMIT ? OFFSET ?")
		.all(limit, offset);
}

export function getAuditCount(): number {
	return (getDb().prepare("SELECT COUNT(*) AS n FROM admin_audit").get() as { n: number }).n;
}

// --- Chat log (bounded moderation history) -----------------------------------

export function writeChatRow(row: {
	room: string;
	userId: number | null;
	username: string;
	ip: string;
	message: string;
	at: number;
}): void {
	getDb()
		.prepare(
			"INSERT INTO chat_log (room, user_id, username, ip, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.run(row.room, row.userId, row.username, row.ip, row.message, row.at);
}

export function getRecentChat(limit: number, room?: string): unknown[] {
	if (room) {
		return getDb()
			.prepare("SELECT * FROM chat_log WHERE room = ? ORDER BY id DESC LIMIT ?")
			.all(room, limit);
	}
	return getDb().prepare("SELECT * FROM chat_log ORDER BY id DESC LIMIT ?").all(limit);
}

export function pruneChatLog(olderThanMs: number): void {
	getDb().prepare("DELETE FROM chat_log WHERE created_at < ?").run(Date.now() - olderThanMs);
}

// --- Server stats (concurrency sampler) ---------------------------------------

export function writeServerStat(ts: number, humans: number, bots: number, roomCount: number): void {
	getDb()
		.prepare(
			"INSERT OR REPLACE INTO server_stats (ts, humans, bots, rooms) VALUES (?, ?, ?, ?)",
		)
		.run(ts, humans, bots, roomCount);
}

export function getServerStatsSince(ts: number): { ts: number; humans: number; bots: number; rooms: number }[] {
	return getDb()
		.prepare("SELECT * FROM server_stats WHERE ts >= ? ORDER BY ts ASC")
		.all(ts) as { ts: number; humans: number; bots: number; rooms: number }[];
}

export function pruneServerStats(olderThanMs: number): void {
	getDb().prepare("DELETE FROM server_stats WHERE ts < ?").run(Date.now() - olderThanMs);
}

// --- Admin analytics aggregates ----------------------------------------------

/** distinct signed-in players per UTC day for the last `days` days */
export function getDailyActiveUsers(days: number): { day: string; users: number }[] {
	const rows = getDb()
		.prepare(
			"SELECT (started_at / 86400000) AS bucket, COUNT(DISTINCT user_id) AS users FROM sessions WHERE user_id IS NOT NULL AND started_at >= ? GROUP BY bucket",
			)
		.all(Date.now() - days * 86_400_000) as { bucket: number; users: number }[];
	const byBucket = new Map(rows.map((r) => [Number(r.bucket), r.users]));
	// fill gaps so the chart shows quiet days as zero rather than skipping them
	const out: { day: string; users: number }[] = [];
	const todayBucket = Math.floor(Date.now() / 86_400_000);
	for (let i = days - 1; i >= 0; i--) {
		const bucket = todayBucket - i;
		const date = new Date(bucket * 86_400_000).toISOString().slice(0, 10);
		out.push({ day: date, users: byBucket.get(bucket) ?? 0 });
	}
	return out;
}

export function getModePopularity(): { mode: string; sessions: number }[] {
	return getDb()
		.prepare(
			"SELECT mode, COUNT(*) AS sessions FROM sessions WHERE mode IS NOT NULL AND mode != '' GROUP BY mode ORDER BY sessions DESC LIMIT 20",
		)
		.all() as { mode: string; sessions: number }[];
}

export function getCrateSources(): { source: string; count: number }[] {
	return getDb()
		.prepare("SELECT source, COUNT(*) AS count FROM user_crates GROUP BY source ORDER BY count DESC LIMIT 20")
		.all() as { source: string; count: number }[];
}

export function getQuestCompletion(): { total: number; claimed: number } {
	const row = getDb()
		.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(claimed), 0) AS claimed FROM user_quests WHERE quest_type = 'daily'")
		.get() as { total: number; claimed: number };
	return row;
}

/** share of accounts whose first week is over that came back after it */
export function getRetention(): { eligible: number; retained: number } {
	const weekMs = 7 * 86_400_000;
	return getDb()
		.prepare(
			"SELECT COUNT(*) AS eligible, COALESCE(SUM(CASE WHEN last_seen - first_seen >= ? THEN 1 ELSE 0 END), 0) AS retained FROM user_activity WHERE first_seen <= ?",
		)
		.get(weekMs, Date.now() - weekMs) as { eligible: number; retained: number };
}

export function deleteUnlock(userId: number, itemType: string, itemId: number): void {
	getDb()
		.prepare("DELETE FROM user_unlocks WHERE user_id = ? AND item_type = ? AND item_id = ?")
		.run(userId, itemType, itemId);
}

export function resetStats(userId: number): void {
	getDb()
		.prepare(
			"UPDATE player_stats SET score = 0, kills = 0, deaths = 0, total_damage = 0, total_healing = 0, total_goals = 0, likes = 0 WHERE user_id = ?",
		)
		.run(userId);
}

export function setScore(userId: number, score: number): void {
	getDb().prepare("UPDATE player_stats SET score = ? WHERE user_id = ?").run(score, userId);
}

// --- Admin / analytics queries ---

export type AdminUserRow = {
	id: number;
	username: string;
	discord_username: string;
	discord_avatar: string;
	created_at: string;
	role: "player" | "mod" | "admin";
	score: number;
	kills: number;
	deaths: number;
	total_damage: number;
	first_seen: number;
	last_seen: number;
	session_count: number;
	play_time_seconds: number;
	last_ip: string;
};

export type SessionRow = {
	id: string;
	user_id: number | null;
	username: string;
	ip: string;
	user_agent: string;
	room: string;
	started_at: number;
	ended_at: number | null;
	duration_seconds: number;
};

export function getAdminUsers(limit: number, offset: number, search?: string): AdminUserRow[] {
	const where = search ? "WHERE u.username LIKE ?" : "";
	const params: unknown[] = search ? [`%${search}%`] : [];
	params.push(limit, offset);
	return getDb()
		.prepare(
			`SELECT u.id, u.username, u.discord_username, u.discord_avatar, u.created_at, u.role,
					COALESCE(ps.score, 0) AS score, COALESCE(ps.kills, 0) AS kills,
					COALESCE(ps.deaths, 0) AS deaths, COALESCE(ps.total_damage, 0) AS total_damage,
					COALESCE(ua.first_seen, 0) AS first_seen, COALESCE(ua.last_seen, 0) AS last_seen,
					COALESCE(ua.session_count, 0) AS session_count,
					COALESCE(ua.play_time_seconds, 0) AS play_time_seconds,
					COALESCE(ua.last_ip, '') AS last_ip
			FROM users u
			LEFT JOIN player_stats ps ON ps.user_id = u.id
			LEFT JOIN user_activity ua ON ua.user_id = u.id
			${where}
			ORDER BY COALESCE(ua.last_seen, 0) DESC
			LIMIT ? OFFSET ?`,
		)
		.all(...params) as AdminUserRow[];
}

export function getAdminUserCount(search?: string): number {
	const where = search ? "WHERE username LIKE ?" : "";
	const params: unknown[] = search ? [`%${search}%`] : [];
	const row = getDb()
		.prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
		.get(...params) as { n: number };
	return row.n;
}

export function getRecentSessions(limit: number): SessionRow[] {
	return getDb()
		.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?")
		.all(limit) as SessionRow[];
}

export function getSessionsForUser(userId: number, limit: number): SessionRow[] {
	return getDb()
		.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?")
		.all(userId, limit) as SessionRow[];
}

export function getUsernamesForIp(ip: string): { username: string; first_seen: number; last_seen: number; count: number }[] {
	return getDb()
		.prepare("SELECT username, first_seen, last_seen, count FROM user_ips WHERE ip = ? ORDER BY last_seen DESC")
		.all(ip) as { username: string; first_seen: number; last_seen: number; count: number }[];
}

export function getIpsForUsername(username: string): { ip: string; first_seen: number; last_seen: number; count: number }[] {
	return getDb()
		.prepare("SELECT ip, first_seen, last_seen, count FROM user_ips WHERE username = ? ORDER BY last_seen DESC")
		.all(username) as { ip: string; first_seen: number; last_seen: number; count: number }[];
}

export function getAdminUserById(id: number): AdminUserRow | undefined {
	return getDb()
		.prepare(
			`SELECT u.id, u.username, u.discord_username, u.discord_avatar, u.created_at, u.role,
					COALESCE(ps.score, 0) AS score, COALESCE(ps.kills, 0) AS kills,
					COALESCE(ps.deaths, 0) AS deaths, COALESCE(ps.total_damage, 0) AS total_damage,
					COALESCE(ua.first_seen, 0) AS first_seen, COALESCE(ua.last_seen, 0) AS last_seen,
					COALESCE(ua.session_count, 0) AS session_count,
					COALESCE(ua.play_time_seconds, 0) AS play_time_seconds,
					COALESCE(ua.last_ip, '') AS last_ip
			FROM users u
			LEFT JOIN player_stats ps ON ps.user_id = u.id
			LEFT JOIN user_activity ua ON ua.user_id = u.id
			WHERE u.id = ?`,
		)
		.get(id) as AdminUserRow | undefined;
}
