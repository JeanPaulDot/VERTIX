import {
	getUserQuestsForPeriod,
	upsertQuest,
	incrementQuestProgress,
	claimQuest as dbClaimQuest,
	getLoginStreak,
	updateLoginStreak,
	claimStreakReward,
	incrementBonusScore,
	grantCrate,
	type QuestRow,
} from "./db.ts";

// --- UTC period helpers ---

function toUtcDate(d: Date): string {
	return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDailyPeriodStart(now: Date): string {
	return toUtcDate(now);
}

function getWeeklyPeriodStart(now: Date): string {
	const d = new Date(now);
	// Monday = 1, Sunday = 0 → treat Sunday as 7
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() - (day - 1));
	return toUtcDate(d);
}

// Quest definitions, rarity weighting, the family->stat map and the picker all
// live in core/src/logic/quests.ts so they can be unit-tested without a database.
// This module keeps the persistence, rewards and payload shaping.
import {
	DAILY_QUEST_POOL,
	WEEKLY_QUEST_POOL,
	QUEST_BY_KEY,
	pickQuests,
	questProgressDelta,
	type QuestRarity,
	type RoundQuestStats,
} from "core/src/logic/quests.ts";

export type { QuestRarity, RoundQuestStats };


// --- Public API ---

export type QuestData = {
	id: number;
	name: string;
	reward: string;
	goal: number;
	progress: number;
	claimed: boolean;
	claimable: boolean;
	questKey: string;
	/** drives the tier styling in the rewards card */
	rarity: QuestRarity;
	/** game mode code this quest is restricted to, if any */
	mode?: string;
};

export type StreakData = {
	day: number;
	claimed: boolean;
	rewardLabel: string;
};

export type QuestPayload = {
	daily: QuestData[];
	weekly: QuestData | null;
	streak: StreakData;
	dailyReset: string;
	weeklyReset: string;
};

function formatCountdown(targetMs: number): string {
	const diff = Math.max(0, targetMs - Date.now());
	const hours = Math.floor(diff / 3600000);
	const mins = Math.floor((diff % 3600000) / 60000);
	if (hours > 0) return `${hours}H ${mins}M`;
	return `${mins}M`;
}

function questToData(q: QuestRow): QuestData {
	const rewardLabel =
		q.reward_type === "crate"
			? `+${q.reward_amount} CRATE${q.reward_amount > 1 ? "S" : ""}`
			: `+${q.reward_amount} SCORE`;
	const def = QUEST_BY_KEY.get(q.quest_key);
	return {
		id: q.id,
		name: q.name,
		reward: rewardLabel,
		goal: q.goal,
		progress: q.progress,
		claimed: q.claimed === 1,
		claimable: q.claimed === 0 && q.progress >= q.goal,
		questKey: q.quest_key,
		rarity: def?.rarity ?? "common",
		mode: def?.mode,
	};
}

/** Ensure the user has quests for the current period, returning them. */
function ensureDailyQuests(userId: number, now: Date): QuestData[] {
	const period = getDailyPeriodStart(now);
	const existing = getUserQuestsForPeriod(userId, "daily", period);
	if (existing.length > 0) return existing.map(questToData);

	// Seeded per user, not just per day. A global seed meant every player in the
	// world woke up to the identical three quests, which made the daily rotation
	// feel like a server-wide announcement rather than a personal objective.
	const seed = `daily-${period}-${userId}`;
	const picked = pickQuests(DAILY_QUEST_POOL, seed, 3);
	for (const def of picked) {
		upsertQuest(userId, "daily", def.key, def.name, def.rewardType, def.rewardAmount, def.goal, period);
	}
	return getUserQuestsForPeriod(userId, "daily", period).map(questToData);
}

function ensureWeeklyQuest(userId: number, now: Date): QuestData | null {
	const period = getWeeklyPeriodStart(now);
	const existing = getUserQuestsForPeriod(userId, "weekly", period);
	if (existing.length > 0) return questToData(existing[0]);

	const seed = `weekly-${period}-${userId}`;
	const picked = pickQuests(WEEKLY_QUEST_POOL, seed, 1);
	if (picked.length === 0) return null;
	const def = picked[0];
	upsertQuest(userId, "weekly", def.key, def.name, def.rewardType, def.rewardAmount, def.goal, period);
	const rows = getUserQuestsForPeriod(userId, "weekly", period);
	return rows.length > 0 ? questToData(rows[0]) : null;
}

function getStreak(userId: number, now: Date): StreakData {
	const streak = getLoginStreak(userId);
	const today = toUtcDate(now);
	const yesterday = toUtcDate(new Date(now.getTime() - 86400000));

	let day = streak.streak_day;
	let claimed = false;

	if (streak.last_login_date === today) {
		// already logged in today — streak is current
		claimed = day >= 7;
	} else if (streak.last_login_date === yesterday) {
		// consecutive day — streak stays, not yet incremented for today
		// will be incremented by recordLogin
	} else if (streak.last_login_date !== "") {
		// missed a day — streak was reset by recordLogin
		day = streak.streak_day;
	}

	return {
		day,
		claimed,
		rewardLabel: day === 7 ? "+1 CRATE" : `+50 SCORE`,
	};
}

export function getQuestPayload(userId: number): QuestPayload {
	const now = new Date();
	const daily = ensureDailyQuests(userId, now);
	const weekly = ensureWeeklyQuest(userId, now);
	const streak = getStreak(userId, now);

	// countdowns
	const todayUtc = new Date(now);
	todayUtc.setUTCHours(24, 0, 0, 0);
	const weekEnd = new Date(now);
	const dayOfWeek = weekEnd.getUTCDay() || 7;
	weekEnd.setUTCDate(weekEnd.getUTCDate() + (8 - dayOfWeek));
	weekEnd.setUTCHours(0, 0, 0, 0);

	return {
		daily,
		weekly,
		streak,
		dailyReset: formatCountdown(todayUtc.getTime()),
		weeklyReset: formatCountdown(weekEnd.getTime()),
	};
}

/** Called on login. Updates streak day. */
export function recordLogin(userId: number): { streakDay: number; justCompletedStreak: boolean } {
	const now = new Date();
	const today = toUtcDate(now);
	const yesterday = toUtcDate(new Date(now.getTime() - 86400000));
	const streak = getLoginStreak(userId);

	let newDay = streak.streak_day;
	let justCompleted = false;

	if (streak.last_login_date === today) {
		// already counted
		return { streakDay: newDay, justCompletedStreak: false };
	}

	if (streak.last_login_date === yesterday) {
		// Day 7 is the end of the cycle, not a plateau. Clamping to 7 meant every
		// further consecutive day re-ran the `newDay >= 7` branch below and granted
		// another crate — a perpetual daily faucet — while the +50 SCORE days never
		// came back. Roll over to day 1 instead, which is what the UI's 7-day track
		// and the README both describe.
		newDay = streak.streak_day >= 7 ? 1 : streak.streak_day + 1;
	} else {
		newDay = 1;
	}

	updateLoginStreak(userId, newDay, today);

	if (newDay >= 7) {
		// completing the week grants the crate; the next login starts a fresh track
		grantCrate(userId, "login_streak");
		justCompleted = true;
	} else {
		incrementBonusScore(userId, 50);
	}

	return { streakDay: newDay, justCompletedStreak: justCompleted };
}

/**
 * Called after round stats save. Advances whichever of the user's quests this
 * round actually fed.
 *
 * This used to be a hand-written table naming every quest key, applied blind to
 * both periods — up to 24 UPDATEs per player per round, most of them against
 * quests the player had never been given, and a new quest meant editing the
 * table. It now reads the user's real rows and asks each quest's own definition
 * what the round is worth, which is also how mode-specific quests work.
 */
export function incrementQuestProgressFromStats(
	userId: number,
	stats: RoundQuestStats,
): void {
	const now = new Date();
	// quest_type is passed through so the two passes can't collide on Mondays,
	// where dailyPeriod === weeklyPeriod
	const periods: [quest_type: "daily" | "weekly", period: string][] = [
		["daily", getDailyPeriodStart(now)],
		["weekly", getWeeklyPeriodStart(now)],
	];

	for (const [questType, period] of periods) {
		for (const row of getUserQuestsForPeriod(userId, questType, period)) {
			if (row.claimed === 1 || row.progress >= row.goal) continue;
			const def = QUEST_BY_KEY.get(row.quest_key);
			if (!def) continue; // a quest that has since been retired from the pool
			const amount = questProgressDelta(def, stats);
			if (amount > 0) {
				incrementQuestProgress(userId, questType, row.quest_key, amount, period);
			}
		}
	}
}
/** Claim a quest reward. Returns the quest row if successful. */
export function claimQuestReward(
	userId: number,
	questId: number,
): { success: boolean; rewardType?: string; rewardAmount?: number } {
	const quest = dbClaimQuest(questId, userId);
	if (!quest) return { success: false };

	if (quest.reward_type === "score") {
		incrementBonusScore(userId, quest.reward_amount);
	} else if (quest.reward_type === "crate") {
		for (let i = 0; i < quest.reward_amount; i++) {
			grantCrate(userId, quest.quest_type === "weekly" ? "quest_weekly" : "quest_daily");
		}
	}

	return { success: true, rewardType: quest.reward_type, rewardAmount: quest.reward_amount };
}

/** Claim streak reward (day 7 crate). Resets streak to 0. */
export function claimStreakRewardForUser(userId: number): boolean {
	const streak = getLoginStreak(userId);
	if (streak.streak_day < 7) return false;
	claimStreakReward(userId);
	return true;
}

/** Lightweight quest progress snapshot for real-time emission during gameplay. */
export function getQuestProgressSnapshot(
	userId: number,
	stats: RoundQuestStats,
): {
	daily: {
		questKey: string;
		progress: number;
		goal: number;
		name: string;
		reward: string;
		rarity: QuestRarity;
		claimed: boolean;
		claimable: boolean;
	}[];
} {
	const now = new Date();
	const dailyPeriod = getDailyPeriodStart(now);
	const quests = getUserQuestsForPeriod(userId, "daily", dailyPeriod);

	const daily = quests.map((q) => {
		// What progress WOULD be once this round is saved. Derived from the quest's
		// own definition — this used to prefix-match the key ("kills", "damage",
		// "win"...), which silently disagreed with the writer the moment a key was
		// named anything else, and could not express a mode restriction at all.
		const def = QUEST_BY_KEY.get(q.quest_key);
		const bonusProgress = def ? questProgressDelta(def, stats) : 0;

		const projected = Math.min(q.goal, q.progress + bonusProgress);
		const rewardLabel =
			q.reward_type === "crate"
				? `+${q.reward_amount} CRATE${q.reward_amount > 1 ? "S" : ""}`
				: `+${q.reward_amount} SCORE`;

		return {
			questKey: q.quest_key,
			progress: projected,
			goal: q.goal,
			name: q.name,
			reward: rewardLabel,
			rarity: def?.rarity ?? "common",
			claimed: q.claimed === 1,
			claimable: q.claimed === 0 && projected >= q.goal,
		};
	});

	return { daily };
}
