import type { Socket } from "socket.io";
import {
	findUserById,
	findUserByUsername,
	getUserStats,
	getProfile,
	findUserClanMembership,
	findClanByName,
	createClan,
	addClanMember,
	removeClanMember,
	deleteClan,
	updateClanChatUrl,
	getClanStats,
	getUserUnlocks,
	getUnopenedCrateCount,
	popOldestUnopenedCrate,
	restoreCrate,
	findUserByUsernameInsensitive,
	updateUserProfile,
	getWorldRank,
	bumpSessionVersion,
} from "./db.ts";
import { validateSession } from "./session.ts";
import { openCrateForUser } from "./unlocks.ts";
import { getQuestPayload, claimQuestReward, claimStreakRewardForUser, recordLogin } from "./quests.ts";
import { createRateLimiter } from "./security.ts";

// Every account-mutating handler below writes to SQLite. None are emitted often
// in normal play, so a shared conservative limiter is enough to stop a client
// hammering the database; keyed per socket.
const accountWriteLimiter = createRateLimiter(20, 10_000);
// Claims and crate opens each run a transaction and can grant rewards, so they
// get a tighter budget of their own.
const rewardClaimLimiter = createRateLimiter(15, 10_000);

const MAX_CLAN_NAME_LENGTH = 4;
const MAX_CHAT_URL_LENGTH = 100;
const MIN_USERNAME_LENGTH = 3;
// matches the maxlength on the in-game name input
const MAX_USERNAME_LENGTH = 15;
const MAX_CHANNEL_LENGTH = 100;
const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

function validateUsername(name: unknown): string | null {
	if (typeof name !== "string") return "Invalid username";
	const trimmed = name.trim();
	if (trimmed.length < MIN_USERNAME_LENGTH || trimmed.length > MAX_USERNAME_LENGTH) {
		return `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters`;
	}
	if (!USERNAME_RE.test(trimmed)) {
		return "Username can only contain letters, numbers, _ and -";
	}
	return null;
}

function validateClanName(name: unknown): string | null {
	if (typeof name !== "string") return "Invalid clan name";
	const trimmed = name.trim();
	if (trimmed.length < 1 || trimmed.length > MAX_CLAN_NAME_LENGTH) {
		return `Clan name must be 1-${MAX_CLAN_NAME_LENGTH} characters`;
	}
	if (!/^[a-zA-Z0-9]+$/.test(trimmed)) return "Clan name can only contain letters and numbers";
	return null;
}

export interface AuthenticatedSocket extends Socket {
	userId?: number;
	username?: string;
}

// Login is Discord-only (see oauth.ts). These socket handlers cover the
// authenticated menu actions; the session cookie is what carries identity.
export function setupAuthHandlers(socket: AuthenticatedSocket): void {
	socket.on("getQuests", () => {
		if (!socket.userId) {
			socket.emit("questData", null);
			return;
		}
		const payload = getQuestPayload(socket.userId);
		socket.emit("questData", payload);
	});

	socket.on("claimQuest", (data: { questId?: number }) => {
		if (!rewardClaimLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("questClaimResult", { success: false });
			return;
		}
		const questId = data?.questId;
		if (typeof questId !== "number") {
			socket.emit("questClaimResult", { success: false });
			return;
		}
		const result = claimQuestReward(socket.userId, questId);
		socket.emit("questClaimResult", result);
		if (result.success) {
			// send updated quest data
			const payload = getQuestPayload(socket.userId);
			socket.emit("questData", payload);
			emitAccountStats(socket);
		}
	});

	socket.on("claimStreak", () => {
		if (!rewardClaimLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("streakClaimResult", { success: false });
			return;
		}
		const success = claimStreakRewardForUser(socket.userId);
		socket.emit("streakClaimResult", { success });
		if (success) {
			const payload = getQuestPayload(socket.userId);
			socket.emit("questData", payload);
			emitAccountStats(socket);
		}
	});

	socket.on("dbLogout", () => {
		// revoke the session server-side, not just drop the local cookie reference
		if (socket.userId) {
			bumpSessionVersion(socket.userId);
		}
		socket.userId = undefined;
		socket.username = undefined;
	});

	// The client listens on "dbChangeUserR" for the result (see app.tsx), which is
	// why this stub answering on "editUserRes" was invisible in the UI.
	socket.on("dbEditUser", (data: { userName?: string; userChannel?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbChangeUserR", "Not logged in", false);
			return;
		}
		const current = findUserById(socket.userId);
		if (!current) {
			socket.emit("dbChangeUserR", "Account not found", false);
			return;
		}

		const requestedName = (data?.userName ?? "").trim() || current.username;
		const nameError = validateUsername(requestedName);
		if (nameError) {
			socket.emit("dbChangeUserR", nameError, false);
			return;
		}
		// case-insensitive so "Bob" can't shadow "bob"; allow keeping your own name
		const clash = findUserByUsernameInsensitive(requestedName);
		if (clash && clash.id !== socket.userId) {
			socket.emit("dbChangeUserR", "That username is taken", false);
			return;
		}

		const channel = (data?.userChannel ?? "").trim().substring(0, MAX_CHANNEL_LENGTH);
		if (!updateUserProfile(socket.userId, requestedName, channel)) {
			socket.emit("dbChangeUserR", "That username is taken", false);
			return;
		}

		// The session cookie's JWT still carries the old name, so attachSocketSession
		// re-reads the username from the DB on every connect rather than trusting the
		// claim — this keeps the current socket consistent until then.
		socket.username = requestedName;
		socket.emit("dbChangeUserR", requestedName, true);
		emitAccountStats(socket);
	});

	socket.on("dbClanCreate", (data: { clanName?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbClanCreateR", "Not logged in", false);
			return;
		}
		const nameError = validateClanName(data?.clanName);
		if (nameError) {
			socket.emit("dbClanCreateR", nameError, false);
			return;
		}
		if (findUserClanMembership(socket.userId)) {
			socket.emit("dbClanCreateR", "You are already in a clan", false);
			return;
		}
		if (findClanByName(data!.clanName!)) {
			socket.emit("dbClanCreateR", "Clan name already taken", false);
			return;
		}
		const clan = createClan(data!.clanName!, socket.userId);
		if (!clan) {
			socket.emit("dbClanCreateR", "Clan name already taken", false);
			return;
		}
		socket.emit("dbClanCreateR", clan.name, true);
		emitClanStats(socket);
	});

	// Joining by name is open by design — the menu advertises "create or join" and
	// there is no invite/accept data model to gate on. The limiter stops a client
	// from using it to hammer the DB or enumerate clan names.
	socket.on("dbClanJoin", (data: { clanKey?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbClanJoinR", "Not logged in", false);
			return;
		}
		if (findUserClanMembership(socket.userId)) {
			socket.emit("dbClanJoinR", "You are already in a clan", false);
			return;
		}
		const clan = findClanByName(data?.clanKey ?? "");
		if (!clan) {
			socket.emit("dbClanJoinR", "Clan not found", false);
			return;
		}
		addClanMember(clan.id, socket.userId, "member");
		socket.emit("dbClanJoinR", clan.name, true);
		emitClanStats(socket);
	});

	// no invite/accept flow exists client-side — an "invite" directly adds the
	// named user to the owner's clan
	socket.on("dbClanInvite", (data: { userName?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbClanInvR", "Not logged in", false);
			return;
		}
		const membership = findUserClanMembership(socket.userId);
		if (!membership || membership.role !== "owner") {
			socket.emit("dbClanInvR", "Only the clan owner can invite", false);
			return;
		}
		const target = findUserByUsername(data?.userName ?? "");
		if (!target) {
			socket.emit("dbClanInvR", "User not found", false);
			return;
		}
		if (findUserClanMembership(target.id)) {
			socket.emit("dbClanInvR", "That user is already in a clan", false);
			return;
		}
		addClanMember(membership.id, target.id, "member");
		socket.emit("dbClanInvR", `${target.username} added to the clan`, true);
	});

	socket.on("dbClanKick", (data: { userName?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbKickInvR", "Not logged in", false);
			return;
		}
		const membership = findUserClanMembership(socket.userId);
		if (!membership || membership.role !== "owner") {
			socket.emit("dbKickInvR", "Only the clan owner can kick", false);
			return;
		}
		const target = findUserByUsername(data?.userName ?? "");
		if (!target || target.id === socket.userId) {
			socket.emit("dbKickInvR", "Invalid user", false);
			return;
		}
		const targetMembership = findUserClanMembership(target.id);
		if (!targetMembership || targetMembership.id !== membership.id) {
			socket.emit("dbKickInvR", "That user is not in your clan", false);
			return;
		}
		removeClanMember(target.id);
		socket.emit("dbKickInvR", `${target.username} removed from the clan`, true);
	});

	socket.on("dbClanChatURL", (data: { chUrl?: string }) => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbChatR", { text: "Not logged in" }, false);
			return;
		}
		const membership = findUserClanMembership(socket.userId);
		if (!membership || membership.role !== "owner") {
			socket.emit("dbChatR", { text: "Only the clan owner can set the chat URL" }, false);
			return;
		}
		const newURL = (data?.chUrl ?? "").trim().substring(0, MAX_CHAT_URL_LENGTH);
		updateClanChatUrl(membership.id, newURL);
		socket.emit("dbChatR", { text: "Chat URL updated", newURL }, true);
	});

	socket.on("dbClanLeave", () => {
		if (!accountWriteLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("dbClanLevR", "Not logged in", false);
			return;
		}
		const membership = findUserClanMembership(socket.userId);
		if (!membership) {
			socket.emit("dbClanLevR", "You are not in a clan", false);
			return;
		}
		if (membership.role === "owner") {
			deleteClan(membership.id);
			socket.emit("dbClanLevR", "Clan disbanded", true);
		} else {
			removeClanMember(socket.userId);
			socket.emit("dbClanLevR", "Left the clan", true);
		}
	});

	socket.on("openCrate", () => {
		if (!rewardClaimLimiter(socket.id)) return;
		if (!socket.userId) {
			socket.emit("crateResult", { error: "Not logged in" });
			return;
		}
		const crate = popOldestUnopenedCrate(socket.userId);
		if (!crate) {
			socket.emit("crateResult", { error: "No crates to open" });
			return;
		}
		const won = openCrateForUser(socket.userId);
		if (!won) {
			// nothing left to win — the account already owns every cosmetic. Put the
			// crate back rather than consuming it for no reward.
			restoreCrate(crate.id);
			socket.emit("crateResult", { error: "You already own every cosmetic" });
			return;
		}
		socket.emit("crateResult", {
			won,
			remaining: getUnopenedCrateCount(socket.userId),
		});
	});
}

/** Push the logged-in account's clan roster/stats to the client, if they're in one. */
export function emitClanStats(socket: AuthenticatedSocket): void {
	if (!socket.userId) return;
	const membership = findUserClanMembership(socket.userId);
	if (!membership) return;
	const stats = getClanStats(membership.id);
	if (stats) socket.emit("dbClanStats", stats);
}

export function setupProfileHandler(socket: Socket): void {
	socket.on("getStats", (data: { statUser?: string }) => {
		const username = data?.statUser;
		if (!username || typeof username !== "string") {
			socket.emit("getStats", "Invalid username", false);
			return;
		}

		const profile = getProfile(username);
		if (!profile) {
			socket.emit("getStats", "Player not found", false);
			return;
		}

		socket.emit("getStats", profile, true);
	});
}

export async function validateSocketSession(
	socket: Socket,
): Promise<{ userId: number; username: string } | null> {
	const cookieHeader = socket.handshake.headers.cookie;
	return validateSession(cookieHeader);
}

/** Attach the cookie session (if any) to the socket, so game code can read userId/username. */
export async function attachSocketSession(socket: AuthenticatedSocket): Promise<void> {
	const session = await validateSocketSession(socket);
	if (session) {
		socket.userId = session.userId;
		// the JWT's username claim goes stale when a player renames themselves, and
		// the cookie lives for 7 days — the DB is the source of truth
		socket.username = findUserById(session.userId)?.username ?? session.username;
	}
}

/**
 * Counts today's login for an authenticated socket. The Discord OAuth callback is
 * the only other caller of recordLogin, and a returning player with a valid 7-day
 * session cookie never re-runs OAuth — so without this the streak never advanced.
 * recordLogin is idempotent per UTC day, so calling it on every connection is safe.
 * Must run before emitAccountStats so the payload reflects the streak's score/crate.
 */
export function recordLoginForSocket(socket: AuthenticatedSocket): void {
	if (!socket.userId) return;
	const { justCompletedStreak } = recordLogin(socket.userId);
	if (justCompletedStreak) socket.emit("streakComplete");
}

/**
 * Build the account payload sent as "updAccStat" / returned by /api/auth/me.
 * `roundDelta` projects not-yet-persisted in-round stats on top of the DB
 * values (round stats only hit the DB at round end via saveRoundStats), so
 * the client's profile chip can update live on every kill/death — mirroring
 * how quest progress snapshots are projected mid-round.
 */
export function buildAccountPayload(
	userId: number,
	username: string,
	roundDelta?: { score: number; kills: number; deaths: number },
) {
	const stats = getUserStats(userId);
	if (!stats) return null;
	const user = findUserById(userId);
	const membership = findUserClanMembership(userId);
	const score = stats.score + (roundDelta?.score ?? 0);
	const kills = stats.kills + (roundDelta?.kills ?? 0);
	const deaths = stats.deaths + (roundDelta?.deaths ?? 0);
	return {
		username,
		avatar: user?.discord_avatar || "",
		clan: membership?.name ?? "",
		isClanOwner: membership?.role === "owner",
		rank: Math.floor(score / 1000),
		// was hardcoded 0 while AccountWidget displayed it
		worldRank: getWorldRank(userId),
		rankPercent: (score % 1000) / 10,
		score,
		likes: stats.likes,
		kills,
		deaths,
		kd: Math.round((kills / Math.max(1, deaths)) * 100) / 100,
		channel: user?.channel ?? "",
		hat: null,
		shirt: null,
		pendingCrates: getUnopenedCrateCount(userId),
	};
}

/** Push the logged-in account's identity + stats to the client (no-op for guests). */
export function emitAccountStats(socket: AuthenticatedSocket): void {
	if (!socket.userId || !socket.username) return;
	const payload = buildAccountPayload(socket.userId, socket.username);
	if (payload) socket.emit("updAccStat", payload);
	emitClanStats(socket);
}

/**
 * Push the logged-in account's owned cosmetics (hat/shirt/camo ids) so the client
 * can enforce owned/locked state in the loadout. Shared by the root ("lobby")
 * namespace and room joins so the menu works before entering a room.
 */
export function emitUnlocks(socket: AuthenticatedSocket): void {
	if (!socket.userId) return;
	const unlocks = getUserUnlocks(socket.userId);
	socket.emit("updUnlocks", {
		hat: unlocks.filter((u) => u.item_type === "hat").map((u) => u.item_id),
		shirt: unlocks.filter((u) => u.item_type === "shirt").map((u) => u.item_id),
		camo: unlocks.filter((u) => u.item_type === "camo").map((u) => u.item_id),
	});
}
