// Covers the quest rules that used to be spread across a hand-written key table
// and a set of key-prefix string matches: what a round is worth, how mode
// restrictions gate it, and how a day's quests are drawn.
import assert from "node:assert/strict";
import {
	DAILY_QUEST_POOL,
	WEEKLY_QUEST_POOL,
	QUEST_BY_KEY,
	questProgressDelta,
	pickQuests,
	seededRandom,
} from "./quests.ts";

let passed = 0;
function check(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

const emptyRound = {
	kills: 0,
	deaths: 0,
	score: 0,
	damage: 0,
	healing: 0,
	goals: 0,
	won: false,
};
const round = (over) => ({ ...emptyRound, ...over });

// --- the pools themselves -------------------------------------------------

check("every quest key is unique across both pools", () => {
	assert.equal(QUEST_BY_KEY.size, DAILY_QUEST_POOL.length + WEEKLY_QUEST_POOL.length);
});

check("every quest is well formed", () => {
	for (const def of [...DAILY_QUEST_POOL, ...WEEKLY_QUEST_POOL]) {
		assert.ok(def.goal > 0, `${def.key} has a non-positive goal`);
		assert.ok(def.rewardAmount > 0, `${def.key} awards nothing`);
		assert.ok(
			["common", "rare", "epic", "legendary"].includes(def.rarity),
			`${def.key} has rarity ${def.rarity}`,
		);
		assert.ok(
			["score", "crate"].includes(def.rewardType),
			`${def.key} has rewardType ${def.rewardType}`,
		);
	}
});

check("the daily pool has more distinct families than a day hands out", () => {
	// pickQuests takes one per family before backfilling, so 3 picks need 3 families
	const families = new Set(DAILY_QUEST_POOL.map((d) => d.family));
	assert.ok(families.size >= 3, `only ${families.size} families in the daily pool`);
});

// --- progress derivation --------------------------------------------------

check("each family reads its own round stat", () => {
	const byFamily = (family) => [...QUEST_BY_KEY.values()].find((d) => d.family === family && !d.mode);
	assert.equal(questProgressDelta(byFamily("kills"), round({ kills: 7 })), 7);
	assert.equal(questProgressDelta(byFamily("damage"), round({ damage: 512 })), 512);
	assert.equal(questProgressDelta(byFamily("heal"), round({ healing: 40 })), 40);
	assert.equal(questProgressDelta(byFamily("goals"), round({ goals: 3 })), 3);
	assert.equal(questProgressDelta(byFamily("score"), round({ score: 900 })), 900);
	assert.equal(questProgressDelta(byFamily("wins"), round({ won: true })), 1);
	assert.equal(questProgressDelta(byFamily("wins"), round({ won: false })), 0);
});

check("a family ignores the stats that are not its own", () => {
	const killQuest = [...QUEST_BY_KEY.values()].find((d) => d.family === "kills" && !d.mode);
	assert.equal(questProgressDelta(killQuest, round({ damage: 9999, healing: 500, won: true })), 0);
});

check("mode-specific quests only advance in their own mode", () => {
	const modeQuest = [...QUEST_BY_KEY.values()].find((d) => d.mode);
	assert.ok(modeQuest, "the pool should contain at least one mode-specific quest");
	const stats = round({ kills: 5, goals: 5, won: true, score: 5, damage: 5, healing: 5 });
	assert.ok(questProgressDelta(modeQuest, { ...stats, mode: modeQuest.mode }) > 0);
	assert.equal(questProgressDelta(modeQuest, { ...stats, mode: "somethingelse" }), 0);
	// no mode on the round at all (e.g. an older caller) must not silently credit it
	assert.equal(questProgressDelta(modeQuest, stats), 0);
});

check("mode-free quests advance whatever the mode is", () => {
	const anyQuest = [...QUEST_BY_KEY.values()].find((d) => d.family === "kills" && !d.mode);
	assert.equal(questProgressDelta(anyQuest, round({ kills: 4, mode: "hp" })), 4);
	assert.equal(questProgressDelta(anyQuest, round({ kills: 4 })), 4);
});

check("progress is never negative or fractional", () => {
	const dmgQuest = [...QUEST_BY_KEY.values()].find((d) => d.family === "damage" && !d.mode);
	assert.equal(questProgressDelta(dmgQuest, round({ damage: -50 })), 0);
	assert.equal(questProgressDelta(dmgQuest, round({ damage: 10.9 })), 10);
});

// --- selection ------------------------------------------------------------

check("seededRandom is deterministic and in range", () => {
	for (const seed of ["a", "daily-2026-01-01-7", ""]) {
		const value = seededRandom(seed);
		assert.equal(value, seededRandom(seed));
		assert.ok(value >= 0 && value < 1, `${seed} -> ${value}`);
	}
});

check("a pick is stable for one user+day and differs between users", () => {
	const keysFor = (seed) => pickQuests(DAILY_QUEST_POOL, seed, 3).map((d) => d.key);
	assert.deepEqual(keysFor("daily-2026-01-01-1"), keysFor("daily-2026-01-01-1"));
	// not every pair must differ, but across many users they must not all match —
	// a global seed used to give every player in the world the same three quests
	const first = keysFor("daily-2026-01-01-1").join();
	const distinct = new Set();
	for (let userId = 1; userId <= 40; userId++) {
		distinct.add(keysFor(`daily-2026-01-01-${userId}`).join());
	}
	assert.ok(distinct.size > 1, "every user drew the identical quest set");
	assert.ok(distinct.has(first));
});

check("a day never hands out two quests tracking the same stat", () => {
	for (let userId = 1; userId <= 100; userId++) {
		const picked = pickQuests(DAILY_QUEST_POOL, `daily-2026-03-04-${userId}`, 3);
		assert.equal(picked.length, 3);
		const families = new Set(picked.map((d) => d.family));
		assert.equal(families.size, 3, `user ${userId} drew ${[...families].join()}`);
	}
});

check("rarity actually biases selection towards common quests", () => {
	const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
	for (let userId = 0; userId < 1500; userId++) {
		for (const def of pickQuests(DAILY_QUEST_POOL, `daily-2026-05-05-${userId}`, 3)) {
			counts[def.rarity]++;
		}
	}
	assert.ok(counts.common > counts.rare, `common ${counts.common} vs rare ${counts.rare}`);
	assert.ok(counts.rare > counts.epic, `rare ${counts.rare} vs epic ${counts.epic}`);
	assert.ok(counts.epic > counts.legendary, `epic ${counts.epic} vs legendary ${counts.legendary}`);
	// but a legendary must still be reachable, or the tier is decorative
	assert.ok(counts.legendary > 0, "no legendary quest was ever drawn");
});

check("asking for more quests than there are families still fills the request", () => {
	const picked = pickQuests(DAILY_QUEST_POOL, "seed", 8);
	assert.equal(picked.length, 8);
	assert.equal(new Set(picked.map((d) => d.key)).size, 8, "picked the same quest twice");
});

check("the weekly pool yields exactly one quest", () => {
	const picked = pickQuests(WEEKLY_QUEST_POOL, "weekly-2026-01-05-3", 1);
	assert.equal(picked.length, 1);
	assert.ok(QUEST_BY_KEY.has(picked[0].key));
});

console.log(`${passed} checks passed`);
