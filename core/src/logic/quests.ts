/**
 * Quest definitions and the pure rules around them: which round stat feeds which
 * quest, how mode restrictions gate progress, and how a day's quests are drawn.
 *
 * Lives in core rather than server/ so it can be unit-tested without a database —
 * server/quests.ts keeps the persistence and reward side.
 */

// --- Quest definitions ---

// `family` groups quests that track the same underlying stat. Picking is limited
// to one quest per family, so a day can't hand out "get 10 kills", "get 15 kills"
// and "get 20 kills" — three objectives that one kill count satisfies at once.
export type QuestFamily = "kills" | "damage" | "wins" | "goals" | "heal" | "score";

/**
 * Rarer quests ask for more and pay more. The weight is how often the tier is
 * picked relative to the others, not a probability — see pickQuests.
 */
export type QuestRarity = "common" | "rare" | "epic" | "legendary";
const RARITY_WEIGHT: Record<QuestRarity, number> = {
	common: 100,
	rare: 40,
	epic: 14,
	legendary: 4,
};

export type QuestDef = {
	key: string;
	family: QuestFamily;
	name: string;
	rewardType: "score" | "crate";
	rewardAmount: number;
	goal: number;
	rarity: QuestRarity;
	/**
	 * Restricts the quest to one game mode (a `code` from gamemodes.ts). Progress
	 * only counts in rounds of that mode; omitted means any mode.
	 */
	mode?: string;
};

/**
 * The single place that says which round stat feeds which quest family.
 *
 * Progress used to be driven by a hand-written list of every quest key, and the
 * live projection separately prefix-matched those same keys — so adding a quest
 * meant editing three places, and renaming one silently stopped it tracking.
 */
export type RoundQuestStats = {
	kills: number;
	deaths: number;
	score: number;
	damage: number;
	healing: number;
	goals: number;
	won: boolean;
	/** game mode code the round was played in; gates mode-specific quests */
	mode?: string;
};

const FAMILY_STAT: Record<QuestFamily, (stats: RoundQuestStats) => number> = {
	kills: (s) => s.kills,
	damage: (s) => s.damage,
	wins: (s) => (s.won ? 1 : 0),
	goals: (s) => s.goals,
	heal: (s) => s.healing,
	score: (s) => s.score,
};

/** How much a round advances one quest. 0 when the quest is for another mode. */
export function questProgressDelta(def: QuestDef, stats: RoundQuestStats): number {
	if (def.mode && def.mode !== stats.mode) return 0;
	return Math.max(0, Math.floor(FAMILY_STAT[def.family](stats)));
}

export const DAILY_QUEST_POOL: QuestDef[] = [
	// --- common: reachable in a session or two ---
	{ key: "kills_10", family: "kills", name: "Get 10 kills", rewardType: "score", rewardAmount: 150, goal: 10, rarity: "common" },
	{ key: "kills_15", family: "kills", name: "Get 15 kills", rewardType: "score", rewardAmount: 200, goal: 15, rarity: "common" },
	{ key: "kills_20", family: "kills", name: "Get 20 kills", rewardType: "score", rewardAmount: 250, goal: 20, rarity: "common" },
	{ key: "damage_500", family: "damage", name: "Deal 500 damage", rewardType: "score", rewardAmount: 200, goal: 500, rarity: "common" },
	{ key: "damage_1000", family: "damage", name: "Deal 1,000 damage", rewardType: "score", rewardAmount: 300, goal: 1000, rarity: "common" },
	{ key: "damage_1500", family: "damage", name: "Deal 1,500 damage", rewardType: "score", rewardAmount: 400, goal: 1500, rarity: "common" },
	{ key: "win_1", family: "wins", name: "Win 1 round", rewardType: "crate", rewardAmount: 1, goal: 1, rarity: "common" },
	{ key: "win_2", family: "wins", name: "Win 2 rounds", rewardType: "crate", rewardAmount: 2, goal: 2, rarity: "common" },
	{ key: "heal_300", family: "heal", name: "Heal 300 HP", rewardType: "score", rewardAmount: 200, goal: 300, rarity: "common" },
	{ key: "score_2500", family: "score", name: "Score 2,500 points", rewardType: "score", rewardAmount: 250, goal: 2500, rarity: "common" },

	// --- rare: a solid evening ---
	{ key: "win_3", family: "wins", name: "Win 3 rounds", rewardType: "crate", rewardAmount: 3, goal: 3, rarity: "rare" },
	{ key: "goals_2", family: "goals", name: "Score 2 goals", rewardType: "crate", rewardAmount: 1, goal: 2, rarity: "rare" },
	{ key: "kills_35", family: "kills", name: "Get 35 kills", rewardType: "score", rewardAmount: 500, goal: 35, rarity: "rare" },
	{ key: "damage_3000", family: "damage", name: "Deal 3,000 damage", rewardType: "score", rewardAmount: 600, goal: 3000, rarity: "rare" },
	{ key: "heal_750", family: "heal", name: "Heal 750 HP", rewardType: "crate", rewardAmount: 1, goal: 750, rarity: "rare" },

	// --- mode-specific: rarer, because they also need the right rotation ---
	{ key: "hp_wins_2", family: "wins", mode: "hp", name: "Win 2 rounds of Hardpoint", rewardType: "crate", rewardAmount: 2, goal: 2, rarity: "rare" },
	{ key: "tdm_kills_20", family: "kills", mode: "tdm", name: "Get 20 kills in Team Deathmatch", rewardType: "score", rewardAmount: 400, goal: 20, rarity: "rare" },
	{ key: "lc_goals_3", family: "goals", mode: "lc", name: "Collect 3 lootcrates", rewardType: "crate", rewardAmount: 1, goal: 3, rarity: "rare" },
	{ key: "ffa_kills_30", family: "kills", mode: "ffa", name: "Get 30 kills in Free For All", rewardType: "crate", rewardAmount: 1, goal: 30, rarity: "epic" },
	{ key: "snipe_kills_15", family: "kills", mode: "snipe", name: "Get 15 kills in Sniper War", rewardType: "score", rewardAmount: 450, goal: 15, rarity: "epic" },
	{ key: "rckt_kills_15", family: "kills", mode: "rckt", name: "Get 15 kills in Rocket War", rewardType: "score", rewardAmount: 450, goal: 15, rarity: "epic" },
	{ key: "pyro_kills_15", family: "kills", mode: "pyro", name: "Get 15 kills in Pyro War", rewardType: "score", rewardAmount: 450, goal: 15, rarity: "epic" },
	{ key: "boss_wins_1", family: "wins", mode: "boss", name: "Win a round of Boss Hunt", rewardType: "crate", rewardAmount: 2, goal: 1, rarity: "epic" },
	{ key: "zmtch_goals_3", family: "goals", mode: "zmtch", name: "Enter the enemy zone 3 times", rewardType: "crate", rewardAmount: 2, goal: 3, rarity: "epic" },

	// --- epic / legendary: a real day of play ---
	{ key: "kills_60", family: "kills", name: "Get 60 kills", rewardType: "crate", rewardAmount: 2, goal: 60, rarity: "epic" },
	{ key: "damage_6000", family: "damage", name: "Deal 6,000 damage", rewardType: "crate", rewardAmount: 2, goal: 6000, rarity: "epic" },
	{ key: "win_6", family: "wins", name: "Win 6 rounds", rewardType: "crate", rewardAmount: 4, goal: 6, rarity: "epic" },
	{ key: "kills_100_daily", family: "kills", name: "Get 100 kills in a day", rewardType: "crate", rewardAmount: 5, goal: 100, rarity: "legendary" },
	{ key: "score_15000_daily", family: "score", name: "Score 15,000 points in a day", rewardType: "crate", rewardAmount: 5, goal: 15000, rarity: "legendary" },
	{ key: "win_10", family: "wins", name: "Win 10 rounds", rewardType: "crate", rewardAmount: 6, goal: 10, rarity: "legendary" },
];

export const WEEKLY_QUEST_POOL: QuestDef[] = [
	{ key: "score_10000", family: "score", name: "Score 10,000 points", rewardType: "crate", rewardAmount: 2, goal: 10000, rarity: "common" },
	{ key: "kills_100", family: "kills", name: "Get 100 kills", rewardType: "crate", rewardAmount: 3, goal: 100, rarity: "common" },
	{ key: "wins_20", family: "wins", name: "Win 20 rounds", rewardType: "crate", rewardAmount: 2, goal: 20, rarity: "common" },
	{ key: "damage_15000", family: "damage", name: "Deal 15,000 damage", rewardType: "crate", rewardAmount: 3, goal: 15000, rarity: "common" },
	{ key: "heal_5000", family: "heal", name: "Heal 5,000 HP", rewardType: "crate", rewardAmount: 3, goal: 5000, rarity: "rare" },
	{ key: "hp_wins_10", family: "wins", mode: "hp", name: "Win 10 rounds of Hardpoint", rewardType: "crate", rewardAmount: 4, goal: 10, rarity: "rare" },
	{ key: "tdm_kills_150", family: "kills", mode: "tdm", name: "Get 150 kills in Team Deathmatch", rewardType: "crate", rewardAmount: 4, goal: 150, rarity: "rare" },
	{ key: "kills_400", family: "kills", name: "Get 400 kills", rewardType: "crate", rewardAmount: 6, goal: 400, rarity: "epic" },
	{ key: "score_50000", family: "score", name: "Score 50,000 points", rewardType: "crate", rewardAmount: 8, goal: 50000, rarity: "legendary" },
];

/**
 * Every quest by key, so progress tracking and the live projection both resolve a
 * stored row back to its definition instead of re-deriving intent from how the
 * key happens to be spelled.
 */
export const QUEST_BY_KEY = new Map<string, QuestDef>();
for (const def of [...DAILY_QUEST_POOL, ...WEEKLY_QUEST_POOL]) {
	if (QUEST_BY_KEY.has(def.key)) {
		throw new Error(`duplicate quest key: ${def.key}`);
	}
	QUEST_BY_KEY.set(def.key, def);
}

// Simple seeded random from date string so all players share the same daily pool
export function seededRandom(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
	}
	return (h >>> 0) / 4294967296;
}

/**
 * Weighted, seeded, no-replacement selection.
 *
 * Each quest gets a sort key of `-ln(u) / weight` for a seeded uniform `u` — the
 * exponential race, which draws without replacement in exact proportion to the
 * weights. Heavier (commoner) tiers come out first most of the time, but a
 * legendary can still turn up on any given day.
 *
 * Still one quest per family first, so a day cannot hand out "get 10 kills",
 * "get 35 kills" and "get 60 kills" — three objectives one kill count satisfies.
 */
export function pickQuests(pool: QuestDef[], seed: string, count: number): QuestDef[] {
	const ranked = pool
		.map((def) => {
			// seededRandom can return exactly 0, and ln(0) is -Infinity
			const u = Math.max(seededRandom(`${seed}:${def.key}`), Number.EPSILON);
			return { def, key: -Math.log(u) / RARITY_WEIGHT[def.rarity] };
		})
		.sort((a, b) => a.key - b.key);

	const picked: QuestDef[] = [];
	const usedFamilies = new Set<QuestFamily>();
	for (const { def } of ranked) {
		if (picked.length >= count) break;
		if (usedFamilies.has(def.family)) continue;
		usedFamilies.add(def.family);
		picked.push(def);
	}
	// backfill only if the pool has fewer distinct families than `count`
	for (const { def } of ranked) {
		if (picked.length >= count) break;
		if (!picked.includes(def)) picked.push(def);
	}
	return picked;
}
