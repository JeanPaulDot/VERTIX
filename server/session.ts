import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "vertix_session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// resolved eagerly at import time so a missing/weak secret crashes the
// server on boot instead of surfacing later as silently-rejected sessions
const secretEnv = process.env.SESSION_SECRET;
if (!secretEnv || secretEnv.length < 32) {
	throw new Error(
		"SESSION_SECRET env var missing or too short (min 32 chars) — see .env.example",
	);
}
const SECRET = new TextEncoder().encode(secretEnv);

function getSecret(): Uint8Array {
	return SECRET;
}

export function isProduction(): boolean {
	return process.env.NODE_ENV === "production";
}

export interface SessionPayload {
	userId: number;
	username: string;
}

export async function createSessionToken(
	userId: number,
	username: string,
): Promise<string> {
	return new SignJWT({ userId, username })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${MAX_AGE}s`)
		.sign(getSecret());
}

export async function validateSessionToken(
	token: string,
): Promise<SessionPayload | null> {
	try {
		const { payload } = await jwtVerify(token, getSecret());
		return {
			userId: payload.userId as number,
			username: payload.username as string,
		};
	} catch {
		return null;
	}
}

export async function createSessionCookie(
	userId: number,
	username: string,
): Promise<string> {
	const token = await createSessionToken(userId, username);
	const encoded = encodeURIComponent(token);
	const secure = isProduction() ? "; Secure" : "";
	return `${SESSION_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export function clearSessionCookie(): string {
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function validateSession(
	cookieHeader: string | undefined,
): Promise<SessionPayload | null> {
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(";").map((c) => c.trim());
	const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
	if (!sessionCookie) return null;

	const token = decodeURIComponent(sessionCookie.split("=").slice(1).join("="));
	return validateSessionToken(token);
}
