import { camos, hats, shirts } from "core/src/skins.ts";
import { getUserUnlocks, grantUnlock, type UnlockItemType } from "./db.ts";

// Sprays have no rarity ("chance") field in their catalog, so the unlock
// economy only covers hats/shirts/camos — there's no rarity data to hook a
// milestone into for sprays.

// Lifetime-score milestones, keyed by the catalog's existing "chance" rarity
// weight (higher chance = more common = unlocks earlier). Items with chance
// <= 0 are treated as disabled/unobtainable and never unlock.
const RARITY_TIERS = [
	{ minChance: 90, scoreThreshold: 0 }, // common — unlocked from the start
	{ minChance: 20, scoreThreshold: 2000 }, // uncommon
	{ minChance: 5, scoreThreshold: 8000 }, // rare
	{ minChance: 0.5, scoreThreshold: 20000 }, // epic
	{ minChance: 0.01, scoreThreshold: 50000 }, // legendary
] as const;

function thresholdForChance(chance: number): number {
	for (const tier of RARITY_TIERS) {
		if (chance >= tier.minChance) return tier.scoreThreshold;
	}
	return Number.POSITIVE_INFINITY;
}

export type UnlockedItem = { name: string; chance: number };

/**
 * Grants any hat/shirt/camo unlocks the player's lifetime score newly
 * qualifies for. Returns the items unlocked by THIS call (empty if none),
 * including their rarity `chance` so callers can render rarity-colored
 * reveal banners.
 */
export function checkForNewUnlocks(userId: number, lifetimeScore: number): UnlockedItem[] {
	const newlyUnlocked: UnlockedItem[] = [];

	for (const hat of hats) {
		if (hat.chance <= 0) continue;
		if (lifetimeScore < thresholdForChance(hat.chance)) continue;
		if (grantUnlock(userId, "hat", hat.id)) newlyUnlocked.push({ name: hat.name, chance: hat.chance });
	}
	for (const shirt of shirts) {
		if (shirt.chance <= 0) continue;
		if (lifetimeScore < thresholdForChance(shirt.chance)) continue;
		if (grantUnlock(userId, "shirt", shirt.id))
			newlyUnlocked.push({ name: shirt.name, chance: shirt.chance });
	}
	for (const camo of camos) {
		if (camo.chance <= 0) continue;
		if (lifetimeScore < thresholdForChance(camo.chance)) continue;
		if (grantUnlock(userId, "camo", camo.id))
			newlyUnlocked.push({ name: camo.name, chance: camo.chance });
	}

	return newlyUnlocked;
}

const CATALOGS: Record<UnlockItemType, { id: number; name: string; chance: number }[]> = {
	hat: hats,
	shirt: shirts,
	camo: camos,
};

/**
 * Returns the user's unlocked items resolved against the catalogs, with their
 * rarity `chance` so callers (e.g. the public profile page) can render
 * rarity-tiered achievement lists. Sorted rarest first.
 */
export function getUserUnlockedItems(
	userId: number,
): { type: UnlockItemType; name: string; chance: number }[] {
	const items: { type: UnlockItemType; name: string; chance: number }[] = [];
	for (const unlock of getUserUnlocks(userId)) {
		const item = CATALOGS[unlock.item_type]?.find((i) => i.id === unlock.item_id);
		if (item) items.push({ type: unlock.item_type, name: item.name, chance: item.chance });
	}
	return items.sort((a, b) => a.chance - b.chance);
}

/**
 * Opens a reward crate: picks a random currently-unowned hat/shirt/camo
 * weighted by its rarity `chance` (not gated by score threshold — that's
 * what makes a crate worth more than the passive unlock system). Returns
 * null if the user already owns everything obtainable.
 */
export function openCrateForUser(
	userId: number,
): { itemType: UnlockItemType; itemId: number; itemName: string; chance: number } | null {
	const owned = new Set(getUserUnlocks(userId).map((u) => `${u.item_type}:${u.item_id}`));
	const pool: { itemType: UnlockItemType; id: number; name: string; chance: number }[] = [];
	for (const itemType of Object.keys(CATALOGS) as UnlockItemType[]) {
		for (const item of CATALOGS[itemType]) {
			if (item.chance <= 0) continue;
			if (owned.has(`${itemType}:${item.id}`)) continue;
			pool.push({ itemType, id: item.id, name: item.name, chance: item.chance });
		}
	}
	if (pool.length === 0) return null;

	const totalWeight = pool.reduce((sum, item) => sum + item.chance, 0);
	let roll = Math.random() * totalWeight;
	let chosen = pool[pool.length - 1];
	for (const item of pool) {
		roll -= item.chance;
		if (roll <= 0) {
			chosen = item;
			break;
		}
	}

	grantUnlock(userId, chosen.itemType, chosen.id);
	return { itemType: chosen.itemType, itemId: chosen.id, itemName: chosen.name, chance: chosen.chance };
}
