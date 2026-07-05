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
} from "./db.ts";
import { validateSession } from "./session.ts";
import { openCrateForUser } from "./unlocks.ts";
import { getQuestPayload, claimQuestReward, claimStreakRewardForUser } from "./quests.ts";

const MAX_CLAN_NAME_LENGTH = 4;
const MAX_CHAT_URL_LENGTH = 100;

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
		socket.userId = undefined;
		socket.username = undefined;
	});

	socket.on("dbEditUser", (data: { userName?: string; userChannel?: string }) => {
		if (!socket.userId) {
			socket.emit("editUserRes", "Not logged in", false);
			return;
		}
		// TODO: implement username/channel editing in Phase 3
		socket.emit("editUserRes", "Profile editing coming soon", false);
	});

	socket.on("dbClanCreate", (data: { clanName?: string }) => {
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

	socket.on("dbClanJoin", (data: { clanKey?: string }) => {
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
		socket.username = session.username;
	}
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
		worldRank: 0,
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
