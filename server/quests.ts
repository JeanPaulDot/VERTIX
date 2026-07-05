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

// --- Quest definitions ---

type QuestDef = {
	key: string;
	name: string;
	rewardType: "score" | "crate";
	rewardAmount: number;
	goal: number;
};

const DAILY_QUEST_POOL: QuestDef[] = [
	{ key: "kills_10", name: "Get 10 kills", rewardType: "score", rewardAmount: 150, goal: 10 },
	{ key: "kills_15", name: "Get 15 kills", rewardType: "score", rewardAmount: 200, goal: 15 },
	{ key: "kills_20", name: "Get 20 kills", rewardType: "score", rewardAmount: 250, goal: 20 },
	{ key: "damage_500", name: "Deal 500 damage", rewardType: "score", rewardAmount: 200, goal: 500 },
	{ key: "damage_1000", name: "Deal 1,000 damage", rewardType: "score", rewardAmount: 300, goal: 1000 },
	{ key: "damage_1500", name: "Deal 1,500 damage", rewardType: "score", rewardAmount: 400, goal: 1500 },
	{ key: "win_1", name: "Win 1 round", rewardType: "crate", rewardAmount: 1, goal: 1 },
	{ key: "win_2", name: "Win 2 rounds", rewardType: "crate", rewardAmount: 2, goal: 2 },
	{ key: "win_3", name: "Win 3 rounds", rewardType: "crate", rewardAmount: 3, goal: 3 },
	{ key: "goals_2", name: "Score 2 goals", rewardType: "crate", rewardAmount: 1, goal: 2 },
	{ key: "heal_300", name: "Heal 300 HP", rewardType: "score", rewardAmount: 200, goal: 300 },
];

const WEEKLY_QUEST_POOL: QuestDef[] = [
	{ key: "score_10000", name: "Score 10,000 points", rewardType: "crate", rewardAmount: 2, goal: 10000 },
	{ key: "kills_100", name: "Get 100 kills", rewardType: "crate", rewardAmount: 3, goal: 100 },
	{ key: "wins_20", name: "Win 20 rounds", rewardType: "crate", rewardAmount: 2, goal: 20 },
	{ key: "damage_15000", name: "Deal 15,000 damage", rewardType: "crate", rewardAmount: 3, goal: 15000 },
];

// Simple seeded random from date string so all players share the same daily pool
function seededRandom(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
	}
	return (h >>> 0) / 4294967296;
}

function pickQuests(pool: QuestDef[], seed: string, count: number): QuestDef[] {
	const shuffled = [...pool].sort((a, b) => seededRandom(seed + a.key) - seededRandom(seed + b.key));
	return shuffled.slice(0, count);
}

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
	return {
		id: q.id,
		name: q.name,
		reward: rewardLabel,
		goal: q.goal,
		progress: q.progress,
		claimed: q.claimed === 1,
		claimable: q.claimed === 0 && q.progress >= q.goal,
		questKey: q.quest_key,
	};
}

/** Ensure the user has quests for the current period, returning them. */
function ensureDailyQuests(userId: number, now: Date): QuestData[] {
	const period = getDailyPeriodStart(now);
	const existing = getUserQuestsForPeriod(userId, "daily", period);
	if (existing.length > 0) return existing.map(questToData);

	const seed = `daily-${period}`;
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

	const seed = `weekly-${period}`;
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
		newDay = Math.min(streak.streak_day + 1, 7);
	} else {
		newDay = 1;
	}

	updateLoginStreak(userId, newDay, today);

	if (newDay >= 7) {
		// grant streak reward
		grantCrate(userId, "login_streak");
		justCompleted = true;
	} else if (newDay >= 1) {
		incrementBonusScore(userId, 50);
	}

	return { streakDay: newDay, justCompletedStreak: justCompleted };
}

/** Called after round stats save. Increments matching quest progress. */
export function incrementQuestProgressFromStats(
	userId: number,
	stats: { kills: number; deaths: number; score: number; damage: number; healing: number; goals: number; won: boolean },
): void {
	const now = new Date();
	const dailyPeriod = getDailyPeriodStart(now);
	const weeklyPeriod = getWeeklyPeriodStart(now);

	// Map stat fields to quest keys
	const increments: { key: string; amount: number }[] = [];

	if (stats.kills > 0) {
		increments.push({ key: "kills_10", amount: stats.kills });
		increments.push({ key: "kills_15", amount: stats.kills });
		increments.push({ key: "kills_20", amount: stats.kills });
		increments.push({ key: "kills_100", amount: stats.kills }); // weekly
	}
	if (stats.damage > 0) {
		increments.push({ key: "damage_500", amount: stats.damage });
		increments.push({ key: "damage_1000", amount: stats.damage });
		increments.push({ key: "damage_1500", amount: stats.damage });
		increments.push({ key: "damage_15000", amount: stats.damage }); // weekly
	}
	if (stats.goals > 0) {
		increments.push({ key: "goals_2", amount: stats.goals });
	}
	if (stats.healing > 0) {
		increments.push({ key: "heal_300", amount: stats.healing });
	}
	if (stats.score > 0) {
		increments.push({ key: "score_10000", amount: stats.score }); // weekly
	}
	if (stats.won) {
		increments.push({ key: "win_1", amount: 1 });
		increments.push({ key: "win_2", amount: 1 });
		increments.push({ key: "win_3", amount: 1 });
		increments.push({ key: "wins_20", amount: 1 }); // weekly
	}

	// Apply increments to both daily and weekly periods
	for (const inc of increments) {
		incrementQuestProgress(userId, inc.key, inc.amount, dailyPeriod);
		incrementQuestProgress(userId, inc.key, inc.amount, weeklyPeriod);
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
	stats: { kills: number; deaths: number; damage: number; healing: number; goals: number; score: number; won: boolean },
): { daily: { questKey: string; progress: number; goal: number; name: string; reward: string; claimed: boolean; claimable: boolean }[] } {
	const now = new Date();
	const dailyPeriod = getDailyPeriodStart(now);
	const quests = getUserQuestsForPeriod(userId, "daily", dailyPeriod);

	const daily = quests.map((q) => {
		// compute what progress WOULD be after applying these stats
		let bonusProgress = 0;
		if (stats.kills > 0 && q.quest_key.startsWith("kills")) bonusProgress += stats.kills;
		if (stats.damage > 0 && q.quest_key.startsWith("damage")) bonusProgress += stats.damage;
		if (stats.goals > 0 && q.quest_key.startsWith("goals")) bonusProgress += stats.goals;
		if (stats.healing > 0 && q.quest_key.startsWith("heal")) bonusProgress += stats.healing;
		if (stats.won && q.quest_key.startsWith("win")) bonusProgress += 1;

		const projected = Math.min(q.goal, q.progress + bonusProgress);
		const rewardLabel = q.reward_type === "crate"
			? `+${q.reward_amount} CRATE${q.reward_amount > 1 ? "S" : ""}`
			: `+${q.reward_amount} SCORE`;

		return {
			questKey: q.quest_key,
			progress: projected,
			goal: q.goal,
			name: q.name,
			reward: rewardLabel,
			claimed: q.claimed === 1,
			claimable: q.claimed === 0 && projected >= q.goal,
		};
	});

	return { daily };
}
