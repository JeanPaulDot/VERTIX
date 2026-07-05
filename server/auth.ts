import type { Socket } from "socket.io";
import bcrypt from "bcrypt";
import {
	createUser,
	findUserById,
	findUserByUsername,
	findUserByEmail,
	getUserStats,
	createEmptyStats,
	getProfile,
	findUserClanMembership,
	findClanByName,
	createClan,
	addClanMember,
	removeClanMember,
	deleteClan,
	updateClanChatUrl,
	getClanStats,
	getUnopenedCrateCount,
	popOldestUnopenedCrate,
} from "./db.ts";
import { createSessionCookie, validateSession } from "./session.ts";
import { checkForNewUnlocks, openCrateForUser } from "./unlocks.ts";
import { getQuestPayload, recordLogin, claimQuestReward, claimStreakRewardForUser } from "./quests.ts";

const BCRYPT_ROUNDS = 10;
const MIN_PASS_LENGTH = 4;
const MAX_PASS_LENGTH = 32;
const MAX_NAME_LENGTH = 15;
const MAX_EMAIL_LENGTH = 40;
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

function validateUsername(username: unknown): string | null {
	if (typeof username !== "string") return "Invalid username";
	const trimmed = username.trim();
	if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH) return "Username must be 1-15 characters";
	if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return "Username can only contain letters, numbers, and underscores";
	return null;
}

function validateEmail(email: unknown): string | null {
	if (typeof email !== "string") return "Invalid email";
	const trimmed = email.trim();
	if (trimmed.length < 3 || trimmed.length > MAX_EMAIL_LENGTH) return "Invalid email";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Invalid email format";
	return null;
}

function validatePassword(pass: unknown): string | null {
	if (typeof pass !== "string") return "Invalid password";
	if (pass.length < MIN_PASS_LENGTH) return `Password must be at least ${MIN_PASS_LENGTH} characters`;
	if (pass.length > MAX_PASS_LENGTH) return `Password must be at most ${MAX_PASS_LENGTH} characters`;
	return null;
}

export function setupAuthHandlers(socket: AuthenticatedSocket): void {
	socket.on("dbLogin", async (data: { userName?: string; userPass?: string }) => {
		const { userName, userPass } = data ?? {};

		const nameError = validateUsername(userName);
		if (nameError) {
			socket.emit("logRes", nameError, false);
			return;
		}

		const passError = validatePassword(userPass);
		if (passError) {
			socket.emit("logRes", passError, false);
			return;
		}

		const user = findUserByUsername(userName!);
		if (!user) {
			socket.emit("logRes", "User not found", false);
			return;
		}

		const match = await bcrypt.compare(userPass!, user.password_hash);
		if (!match) {
			socket.emit("logRes", "Incorrect password", false);
			return;
		}

		const stats = getUserStats(user.id);
		if (!stats) {
			createEmptyStats(user.id);
		}
		const newlyUnlocked = checkForNewUnlocks(user.id, stats?.score ?? 0);

		socket.userId = user.id;
		socket.username = user.username;

		const sessionCookie = await createSessionCookie(user.id, user.username);
		socket.emit(
			"logRes",
			{
				text: user.username,
				logKey: `${user.id}-${Date.now()}`,
				cookie: sessionCookie,
			},
			true,
		);

		if (newlyUnlocked.length > 0) socket.emit("unlockReveal", newlyUnlocked);
		emitAccountStats(socket);
		const loginResult = recordLogin(user.id);
		if (loginResult.justCompletedStreak) {
			socket.emit("streakComplete");
		}
	});

	socket.on(
		"dbReg",
		async (data: { userName?: string; userEmail?: string; userPass?: string }) => {
			const { userName, userEmail, userPass } = data ?? {};

			const nameError = validateUsername(userName);
			if (nameError) {
				socket.emit("regRes", nameError, false);
				return;
			}

			const emailError = validateEmail(userEmail);
			if (emailError) {
				socket.emit("regRes", emailError, false);
				return;
			}

			const passError = validatePassword(userPass);
			if (passError) {
				socket.emit("regRes", passError, false);
				return;
			}

			if (findUserByUsername(userName!)) {
				socket.emit("regRes", "Username already taken", false);
				return;
			}

			if (findUserByEmail(userEmail!)) {
				socket.emit("regRes", "Email already registered", false);
				return;
			}

			const hash = await bcrypt.hash(userPass!, BCRYPT_ROUNDS);
			const newUser = createUser(userName!, userEmail!, hash);
			createEmptyStats(newUser.id);
			checkForNewUnlocks(newUser.id, 0);

		socket.userId = newUser.id;
		socket.username = newUser.username;

		const sessionCookie = await createSessionCookie(newUser.id, newUser.username);
		socket.emit(
			"regRes",
			`Registered as ${newUser.username}`,
			true,
		);

		socket.emit(
			"logRes",
			{
				text: newUser.username,
				logKey: `${newUser.id}-${Date.now()}`,
				cookie: sessionCookie,
			},
			true,
		);

			emitAccountStats(socket);
			const loginResult = recordLogin(newUser.id);
			if (loginResult.justCompletedStreak) {
				socket.emit("streakComplete");
			}
		},
	);

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

	socket.on("dbRecov", (data: { userMail?: string }) => {
		socket.emit("recovRes", "Password recovery is not yet implemented", false);
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
