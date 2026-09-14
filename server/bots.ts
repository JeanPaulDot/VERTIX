// Bot identity + difficulty definitions. The behavior itself (brain tick,
// lifecycle) lives on Room in room.ts, since it reuses the same input-apply
// methods real players go through.

export type BotDifficulty = {
	name: "Rookie" | "Regular" | "Veteran" | "Ace";
	/** rank order, also the eviction priority (lowest evicted first) */
	tier: number;
	/** max aim jitter in radians, applied per shot/tick */
	aimError: number;
	/** delay before engaging a newly acquired target */
	reactionDelayMs: number;
	/** how twitchy the bot's strafing/dodging is (0..1) */
	strafeChance: number;
	/** fraction of the weapon's max fire rate the bot actually uses */
	fireDiscipline: number;
};

export const BOT_DIFFICULTIES: BotDifficulty[] = [
	{ name: "Rookie", tier: 0, aimError: 0.35, reactionDelayMs: 600, strafeChance: 0.15, fireDiscipline: 0.5 },
	{ name: "Regular", tier: 1, aimError: 0.18, reactionDelayMs: 350, strafeChance: 0.35, fireDiscipline: 0.75 },
	{ name: "Veteran", tier: 2, aimError: 0.08, reactionDelayMs: 150, strafeChance: 0.55, fireDiscipline: 0.9 },
	{ name: "Ace", tier: 3, aimError: 0.02, reactionDelayMs: 60, strafeChance: 0.7, fireDiscipline: 1.0 },
];

// weighted toward the middle tiers: 15% / 40% / 35% / 10%
const TIER_WEIGHTS = [0.15, 0.4, 0.35, 0.1];

export function randomBotDifficulty(): BotDifficulty {
	let roll = Math.random();
	for (let i = 0; i < BOT_DIFFICULTIES.length; i++) {
		roll -= TIER_WEIGHTS[i];
		if (roll <= 0) return BOT_DIFFICULTIES[i];
	}
	return BOT_DIFFICULTIES[1];
}

const NAME_ADJECTIVES = [
	"Sneaky", "Rusty", "Turbo", "Grumpy", "Pixel", "Salty", "Spicy", "Lucky",
	"Shady", "Rapid", "Frosty", "Wobbly", "Mega", "Crispy", "Silent", "Feral",
	"Cosmic", "Dizzy", "Angry", "Chunky", "Slick", "Rogue", "Hyper", "Sleepy",
];

const NAME_NOUNS = [
	"Fox", "Wizard", "Bandit", "Rocket", "Panda", "Viper", "Ghost", "Falcon",
	"Badger", "Goblin", "Knight", "Otter", "Raptor", "Shark", "Sniper", "Tank",
	"Wolf", "Yeti", "Pirate", "Robot", "Moose", "Hornet", "Cobra", "Duck",
];

export function randomBotName(): string {
	const adj = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
	const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
	// max name length is 15 chars client-side; keep bot names within it too
	return `${adj}${noun}`.substring(0, 15);
}

// playable classes for bots: everything real players can pick except Duck
// (index 8, no weapons, jump-explosion gimmick) and the boss-only classes
export const BOT_CLASS_POOL = [0, 1, 2, 3, 4, 5, 6, 7, 9];

// rough per-class preferred engagement distance (px); default 350
export const BOT_PREFERRED_RANGE: Record<number, number> = {
	2: 600, // Hunter (sniper) keeps distance
	4: 220, // Vince (shotgun) pushes in
	7: 200, // Arsonist (flamethrower) pushes in
	6: 300, // Spray N' Pray
	5: 520, // Rocketeer — 240px blast radius, and it damages the shooter
	9: 480, // Nademan — same blast radius, arcing projectile
};

/**
 * How far outside its own blast radius a bot insists on being before firing an
 * explosive. Rocketeer and Nademan carry a 240px blast; the old default range of
 * 350 put the retreat threshold at 175px, well inside it, so they routinely blew
 * themselves up on a target they had just walked into.
 */
export const BOT_BLAST_SAFETY_MARGIN = 1.35;

export type BotState = {
	difficulty: BotDifficulty;
	targetIndex: number | null;
	targetAcquiredAt: number;
	lastShotAt: number;
	respawnAt: number;
	lastX: number;
	lastY: number;
	stuckSince: number;
	strafeDir: 1 | -1;
	strafeUntil: number;
	// The brain runs at BOT_TICK_MS, but movement is integrated on the much finer
	// position tick so bots produce smooth per-tick positions instead of one
	// 100ms teleport every sixth broadcast. These hold the current intent between
	// decisions; `jump` is consumed once rather than repeating every step.
	moveX: number;
	moveY: number;
	jump: 0 | 1;
};

export function createBotState(difficulty: BotDifficulty): BotState {
	return {
		difficulty,
		targetIndex: null,
		targetAcquiredAt: 0,
		lastShotAt: 0,
		respawnAt: 0,
		lastX: 0,
		lastY: 0,
		stuckSince: 0,
		strafeDir: Math.random() < 0.5 ? 1 : -1,
		strafeUntil: 0,
		moveX: 0,
		moveY: 0,
		jump: 0,
	};
}
