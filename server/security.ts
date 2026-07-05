import { characterClasses } from "core/src/loadouts.ts";
import { camos, hats, shirts } from "core/src/skins.ts";

const HTML_TAG_RE = /<[^>]*>/g;
const MAX_NAME_LENGTH = 25;
const MAX_CHAT_LENGTH = 50;
const MAX_MOVEMENT_DELTA = 100;
const MAX_SHOOT_DISTANCE = 500;

export function sanitizeName(name: unknown): string {
	if (typeof name !== "string") return "UNKNOWN";
	const cleaned = name.replace(HTML_TAG_RE, "").trim();
	if (cleaned.length === 0) return "UNKNOWN";
	return cleaned.substring(0, MAX_NAME_LENGTH);
}

export function isValidClassIndex(index: unknown): boolean {
	return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < characterClasses.length;
}

export function clampNumber(value: unknown, min: number, max: number): number {
	const num = typeof value === "number" && Number.isFinite(value) ? value : min;
	return Math.max(min, Math.min(max, num));
}

export function isValidHatIndex(id: unknown): boolean {
	return typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= hats.length;
}

export function isValidShirtIndex(id: unknown): boolean {
	return typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= shirts.length;
}

// 0 means "no camo" (client sends `primaryCamo?.id ?? 0`) — always valid,
// no ownership needed; 1..camos.length are real, ownership-gated camo ids
export function isValidCamoIndex(id: unknown): boolean {
	return typeof id === "number" && Number.isInteger(id) && id >= 0 && id <= camos.length;
}

export function isValidWeaponIndex(id: unknown, weaponCount: number): boolean {
	return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < weaponCount;
}

export function isValidModeVoteIndex(i: unknown, modeVotes: unknown[]): boolean {
	return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < modeVotes.length;
}

// custom map uploads: keep in line with the size of the built-in maps (roughly
// 15-25 tiles per side) so a malformed/huge upload can't hang the server
// generating tiles or blow past reasonable memory
const MIN_MAP_TILES = 8;
const MAX_MAP_TILES = 64;

export function isValidGenData(genData: unknown): genData is {
	width: number;
	height: number;
	data: ArrayLike<number>;
} {
	if (!genData || typeof genData !== "object") return false;
	const { width, height, data } = genData as Record<string, unknown>;
	if (
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < MIN_MAP_TILES ||
		width > MAX_MAP_TILES ||
		height < MIN_MAP_TILES ||
		height > MAX_MAP_TILES
	) {
		return false;
	}
	if (!data || typeof data !== "object") return false;
	// mirrors the same `.data.data || .data` unwrap used when reading the buffer,
	// since JSON round-tripping can turn a Uint8ClampedArray into a plain object
	const buffer = (data as { data?: unknown }).data ?? data;
	if (!buffer || typeof buffer !== "object") return false;
	const expectedBytes = width * height * 4;
	// last required byte must be present (works for arrays, typed arrays, and
	// plain objects with numeric string keys alike)
	return (buffer as Record<number, unknown>)[expectedBytes - 1] !== undefined;
}

export function isWithinShootDistance(
	claimedX: number,
	claimedY: number,
	serverX: number,
	serverY: number,
): boolean {
	const dx = claimedX - serverX;
	const dy = claimedY - serverY;
	return Math.sqrt(dx * dx + dy * dy) <= MAX_SHOOT_DISTANCE;
}

export function sanitizeChatMessage(msg: unknown): string {
	if (typeof msg !== "string") return "";
	return msg.substring(0, MAX_CHAT_LENGTH);
}

export function clampMovementDelta(value: unknown): number {
	return clampNumber(value, -1, 1);
}

export function clampMovementInput(data: {
	hdt: unknown;
	vdt: unknown;
	delta: unknown;
	s: unknown;
	isn: unknown;
}): { hdt: number; vdt: number; delta: number; s: number; isn: number } {
	return {
		hdt: clampMovementDelta(data.hdt),
		vdt: clampMovementDelta(data.vdt),
		delta: clampNumber(data.delta, 0, MAX_MOVEMENT_DELTA),
		s: data.s === 1 ? 1 : 0,
		isn: clampNumber(data.isn, 0, 2_147_483_647),
	};
}

// smooth per-key throttle (min gap between allowed calls), unlike
// createRateLimiter's fixed per-second window: that shape is wrong for
// per-frame input (movement/aim), since a high refresh-rate client blows
// through a fixed window's quota partway through the second and then has
// every remaining frame dropped until the window resets, which reads to
// the client as the server freezing then snapping their position back
export function createIntervalLimiter(minIntervalMs: number) {
	const last = new Map<string, number>();

	return function isAllowed(key: string): boolean {
		const now = Date.now();
		const prev = last.get(key) ?? 0;
		if (now - prev < minIntervalMs) return false;
		last.set(key, now);
		if (last.size > 10000) {
			for (const [k, t] of last) {
				if (now - t > 60_000) last.delete(k);
			}
		}
		return true;
	};
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
	const hits = new Map<string, { count: number; resetAt: number }>();

	function cleanup() {
		const now = Date.now();
		for (const [key, entry] of hits) {
			if (now >= entry.resetAt) hits.delete(key);
		}
	}

	return function isAllowed(key: string): boolean {
		const now = Date.now();
		const entry = hits.get(key);
		if (!entry || now >= entry.resetAt) {
			hits.set(key, { count: 1, resetAt: now + windowMs });
			if (hits.size > 10000) cleanup();
			return true;
		}
		if (entry.count >= maxRequests) return false;
		entry.count++;
		return true;
	};
}

export function createConnectionLimiter(maxPerIp: number) {
	const counts = new Map<string, number>();

	return {
		increment: (ip: string): boolean => {
			const current = counts.get(ip) ?? 0;
			if (current >= maxPerIp) return false;
			counts.set(ip, current + 1);
			return true;
		},
		decrement: (ip: string) => {
			const current = counts.get(ip) ?? 1;
			if (current <= 1) counts.delete(ip);
			else counts.set(ip, current - 1);
		},
	};
}
