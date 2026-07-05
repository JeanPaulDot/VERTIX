import { Hono } from "hono";
import bcrypt from "bcrypt";
import { createSessionCookie, isProduction, validateSession } from "./session.ts";
import { buildAccountPayload } from "./auth.ts";
import { createRateLimiter } from "./security.ts";
import {
	findUserByDiscordId,
	createDiscordUser,
	findUserByUsername,
	findUserByEmail,
	createUser,
	getUserStats,
	createEmptyStats,
} from "./db.ts";
import { checkForNewUnlocks } from "./unlocks.ts";
import { recordLogin } from "./quests.ts";

// brute-force / enumeration protection, keyed by client IP
const loginLimiter = createRateLimiter(10, 60000);
const registerLimiter = createRateLimiter(5, 60000);

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
	return c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
}

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const DISCORD_REDIRECT_URI =
	process.env.DISCORD_REDIRECT_URI ?? "http://localhost:5173/api/auth/discord/callback";

const DISCORD_AUTH_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";

function generateState(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

interface DiscordTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
}

interface DiscordUser {
	id: string;
	username: string;
	avatar: string;
	discriminator: string;
	global_name: string | null;
}

async function exchangeCode(code: string): Promise<DiscordTokenResponse> {
	const body = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		client_secret: DISCORD_CLIENT_SECRET,
		code,
		grant_type: "authorization_code",
		redirect_uri: DISCORD_REDIRECT_URI,
	});

	const res = await fetch(DISCORD_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
	}

	return res.json() as Promise<DiscordTokenResponse>;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
	const res = await fetch(DISCORD_USER_URL, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Discord user fetch failed: ${res.status} ${text}`);
	}

	return res.json() as Promise<DiscordUser>;
}

function getAvatarUrl(discordId: string, avatar: string | null): string {
	if (!avatar) return "";
	return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
}

export function createOAuthRoutes(): Hono {
	const app = new Hono();

	app.get("/auth/discord", (c) => {
		if (!DISCORD_CLIENT_ID) {
			return c.json({ error: "Discord OAuth not configured" }, 500);
		}

		const state = generateState();
		const url = new URL(DISCORD_AUTH_URL);
		url.searchParams.set("client_id", DISCORD_CLIENT_ID);
		url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", "identify");
		url.searchParams.set("state", state);
		// returning users who already authorized skip the consent screen entirely
		url.searchParams.set("prompt", "none");

		const secure = isProduction() ? "; Secure" : "";
		c.header(
			"Set-Cookie",
			`oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
			{ append: true },
		);
		// popup mode: the callback answers with a self-closing page instead of a redirect
		if (c.req.query("popup") === "1") {
			c.header(
				"Set-Cookie",
				`oauth_popup=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
				{ append: true },
			);
		} else {
			c.header("Set-Cookie", "oauth_popup=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", {
				append: true,
			});
		}
		return c.redirect(url.toString());
	});

	app.get("/auth/discord/callback", async (c) => {
		const code = c.req.query("code");
		const state = c.req.query("state");
		const error = c.req.query("error");

		const cookieHeader = c.req.header("Cookie") ?? "";
		const cookies = Object.fromEntries(
			cookieHeader.split(";").map((c) => {
				const [k, ...v] = c.trim().split("=");
				return [k, v.join("=")];
			}),
		);
		const isPopup = cookies.oauth_popup === "1";
		// in popup mode, answer with a tiny page that notifies the game window and
		// closes itself, so the game never navigates away or reloads
		const finish = (err: string | null) => {
			if (!isPopup) {
				return c.redirect(err ? `/?error=${encodeURIComponent(err)}` : "/");
			}
			const message = JSON.stringify({ type: "vertix:discord-login", error: err }).replace(
				/</g,
				"\\u003c",
			);
			return c.html(
				`<!DOCTYPE html><html><body><script>
					if (window.opener) {
						window.opener.postMessage(${message}, window.location.origin);
						window.close();
					} else {
						window.location.replace(${JSON.stringify(err ? `/?error=${encodeURIComponent(err)}` : "/")});
					}
				</script>Logging in… you can close this window.</body></html>`,
			);
		};

		if (error) {
			return finish(error);
		}

		if (!code) {
			return finish("no_code");
		}

		if (!state || cookies.oauth_state !== state) {
			return finish("invalid_state");
		}
		// state is single-use; expire it now that it has been checked
		c.header("Set-Cookie", "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");

		try {
			const tokenData = await exchangeCode(code);
			const discordUser = await fetchDiscordUser(tokenData.access_token);

			let user = findUserByDiscordId(discordUser.id);

			if (!user) {
				// Check if there's a username conflict
				let username = discordUser.username;
				if (findUserByUsername(username)) {
					username = `${username}_${discordUser.id.slice(-4)}`;
				}

				const avatarUrl = getAvatarUrl(discordUser.id, discordUser.avatar);
				user = createDiscordUser({
					discordId: discordUser.id,
					discordUsername: discordUser.username,
					discordAvatar: avatarUrl,
					username,
				});
			}

			const stats = getUserStats(user.id);
			if (!stats) {
				createEmptyStats(user.id);
			}
			checkForNewUnlocks(user.id, stats?.score ?? 0);

			const cookie = await createSessionCookie(user.id, user.username);
			// append: a Set-Cookie header clearing oauth_state is already present
			c.header("Set-Cookie", cookie, { append: true });
			recordLogin(user.id);
			return finish(null);
		} catch (err) {
			console.error("Discord OAuth error:", err);
			return finish("oauth_failed");
		}
	});

	// current session's account payload; lets the client refresh login state
	// (e.g. after the OAuth popup closes) without reloading the page
	app.get("/auth/me", async (c) => {
		const session = await validateSession(c.req.header("Cookie"));
		if (!session) {
			return c.json({ error: "Not logged in" }, 401);
		}
		const payload = buildAccountPayload(session.userId, session.username);
		if (!payload) {
			return c.json({ error: "No account data" }, 404);
		}
		return c.json(payload);
	});

	app.get("/auth/logout", (c) => {
		const cookie = `vertix_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
		c.header("Set-Cookie", cookie);
		return c.redirect("/");
	});

	app.post("/auth/login", async (c) => {
		if (!loginLimiter(clientIp(c))) {
			return c.json({ error: "Too many login attempts. Try again later." }, 429);
		}
		const data = await c.req.json().catch(() => ({}));
		const { userName, userPass } = data ?? {};

		if (!userName || !userPass) {
			return c.json({ error: "Username and password required" }, 400);
		}

		const user = findUserByUsername(userName);
		if (!user) {
			return c.json({ error: "User not found" }, 401);
		}

		const match = await bcrypt.compare(userPass, user.password_hash);
		if (!match) {
			return c.json({ error: "Incorrect password" }, 401);
		}

		const stats = getUserStats(user.id);
		if (!stats) {
			createEmptyStats(user.id);
		}
		const newlyUnlocked = checkForNewUnlocks(user.id, stats?.score ?? 0);

		const cookie = await createSessionCookie(user.id, user.username);
		c.header("Set-Cookie", cookie);
		recordLogin(user.id);
		return c.json({ username: user.username, newlyUnlocked });
	});

	app.post("/auth/register", async (c) => {
		if (!registerLimiter(clientIp(c))) {
			return c.json({ error: "Too many attempts. Try again later." }, 429);
		}
		const data = await c.req.json().catch(() => ({}));
		const { userName, userEmail, userPass } = data ?? {};

		if (!userName || !userEmail || !userPass) {
			return c.json({ error: "All fields required" }, 400);
		}

		const trimmedName = userName.trim();
		if (trimmedName.length < 1 || trimmedName.length > 15) {
			return c.json({ error: "Username must be 1-15 characters" }, 400);
		}
		if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
			return c.json({ error: "Username can only contain letters, numbers, and underscores" }, 400);
		}

		const trimmedEmail = userEmail.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
			return c.json({ error: "Invalid email format" }, 400);
		}

		if (userPass.length < 4 || userPass.length > 32) {
			return c.json({ error: "Password must be 4-32 characters" }, 400);
		}

		if (findUserByUsername(trimmedName)) {
			return c.json({ error: "Username already taken" }, 409);
		}

		if (findUserByEmail(trimmedEmail)) {
			return c.json({ error: "Email already registered" }, 409);
		}

		const hash = await bcrypt.hash(userPass, 10);
		const newUser = createUser(trimmedName, trimmedEmail, hash);
		createEmptyStats(newUser.id);
		checkForNewUnlocks(newUser.id, 0);

		const cookie = await createSessionCookie(newUser.id, newUser.username);
		c.header("Set-Cookie", cookie);
		recordLogin(newUser.id);
		return c.json({ username: newUser.username });
	});

	return app;
}
