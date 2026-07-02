import { characterClasses } from "core/src/loadouts.ts";
import { hats, shirts } from "core/src/skins.ts";

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

export function isValidWeaponIndex(id: unknown, weaponCount: number): boolean {
	return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < weaponCount;
}

export function isValidModeVoteIndex(i: unknown, modeVotes: unknown[]): boolean {
	return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < modeVotes.length;
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
