// Pure moderation logic — no imports, no DB, fully unit-testable.
//
// The SQL halves live in db.ts and the enforcement halves live in room.ts /
// index.ts / admin.ts; this file holds the shared decisions so they cannot
// drift between call sites (e.g. "expired at exactly expires_at" must mean the
// same thing in the join check and in the admin panel's list).

export type BanKind = "user" | "ip";

/** Shape shared by bans and mutes (both are the same sanction at different scopes). */
export type SanctionRowLike = {
	active: number;
	/** epoch ms, NULL = permanent */
	expires_at: number | null;
};

/**
 * Is this sanction currently in force?
 *
 * A sanction is active when flagged active AND (permanent OR not yet expired).
 * `expires_at === now` counts as expired: a 60-minute mute must stop silencing
 * at exactly the 60-minute mark, not one millisecond later.
 */
export function isSanctionActive(row: SanctionRowLike, now: number): boolean {
	return row.active === 1 && (row.expires_at === null || row.expires_at > now);
}

/**
 * The subject a sanction should attach to: the account when signed in, the IP
 * otherwise. Account-first matters — an IP ban would blanket a school network,
 * and banning the account first is what lets the evasion story be visible in
 * the admin panel (the IP correlation then shows the alt).
 */
export function sanctionSubject(input: {
	userId?: number | null;
	ip?: string | null;
}): { kind: BanKind; value: string } | null {
	if (input.userId != null) return { kind: "user", value: String(input.userId) };
	if (input.ip) return { kind: "ip", value: input.ip };
	return null;
}

/** minutes → epoch-ms expiry; null/undefined means permanent. */
export function expiryFromMinutes(minutes: number | null | undefined, now: number): number | null {
	if (minutes == null) return null;
	if (!Number.isFinite(minutes) || minutes <= 0) return null;
	return now + Math.floor(minutes) * 60_000;
}

// --- admin permissions -------------------------------------------------------
//
// ADMIN_TOKEN (break-glass) always maps to "admin". Session-cookie
// authentication maps to the user's role column. Mods get the day-to-day
// toolbox; anything structural or irreversible is admin-only.

export type AdminRole = "mod" | "admin";

export type AdminAction =
	| "read"
	| "kick"
	| "mute"
	| "tempban"
	| "ban"
	| "unban"
	| "accountEdit"
	| "roomManage"
	| "serverManage"
	| "roleSet"
	| "bugResolve";

const MOD_ACTIONS: ReadonlySet<AdminAction> = new Set([
	"read",
	"kick",
	"mute",
	"tempban",
	"bugResolve",
]);

export function canAccess(role: AdminRole, action: AdminAction): boolean {
	if (role === "admin") return true;
	return MOD_ACTIONS.has(action);
}

/** Normalises anything a request body might carry into a role, or null. */
export function parseRole(value: unknown): AdminRole | "player" | null {
	if (value === "mod" || value === "admin" || value === "player") return value;
	return null;
}
