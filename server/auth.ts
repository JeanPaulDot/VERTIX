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
} from "./db.ts";
import { createSessionCookie, validateSession } from "./session.ts";

const BCRYPT_ROUNDS = 10;
const MIN_PASS_LENGTH = 4;
const MAX_PASS_LENGTH = 32;
const MAX_NAME_LENGTH = 15;
const MAX_EMAIL_LENGTH = 40;

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

		socket.emit("updAccStat", {
			username: user.username,
			clan: "",
			rank: Math.floor((stats?.score ?? 0) / 1000),
			worldRank: 0,
			rankPercent: ((stats?.score ?? 0) % 1000) / 10,
			likes: stats?.likes ?? 0,
			kills: stats?.kills ?? 0,
			deaths: stats?.deaths ?? 0,
			kd: Math.round(((stats?.kills ?? 0) / Math.max(1, stats?.deaths ?? 1)) * 100) / 100,
			channel: user.channel,
			hat: null,
			shirt: null,
		});
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

			socket.emit("updAccStat", {
				username: newUser.username,
				clan: "",
				rank: 0,
				worldRank: 0,
				rankPercent: 0,
				likes: 0,
				kills: 0,
				deaths: 0,
				kd: 0,
				channel: "",
				hat: null,
				shirt: null,
			});
		},
	);

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

	// Clan events — stub responses for now (deferred to later)
	for (const evt of [
		"dbClanCreate",
		"dbClanJoin",
		"dbClanInvite",
		"dbClanKick",
		"dbClanChatURL",
		"dbClanLeave",
	]) {
		socket.on(evt, () => {
			socket.emit(`${evt}R`, "Clans coming soon", false);
		});
	}
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

/** Push the logged-in account's identity + stats to the client (no-op for guests). */
export function emitAccountStats(socket: AuthenticatedSocket): void {
	if (!socket.userId || !socket.username) return;
	const stats = getUserStats(socket.userId);
	if (!stats) return;
	const user = findUserById(socket.userId);
	socket.emit("updAccStat", {
		username: socket.username,
		avatar: user?.discord_avatar || "",
		clan: "",
		rank: Math.floor(stats.score / 1000),
		worldRank: 0,
		rankPercent: (stats.score % 1000) / 10,
		likes: stats.likes,
		kills: stats.kills,
		deaths: stats.deaths,
		kd: Math.round((stats.kills / Math.max(1, stats.deaths)) * 100) / 100,
		channel: user?.channel ?? "",
		hat: null,
		shirt: null,
	});
}
