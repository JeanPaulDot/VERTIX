import { Hono } from "hono";
import { createSessionCookie, isProduction, validateSession } from "./session.ts";
import { buildAccountPayload } from "./auth.ts";
import {
	findUserByDiscordId,
	createDiscordUser,
	findUserByUsername,
	getUserStats,
	createEmptyStats,
} from "./db.ts";
import { checkForNewUnlocks } from "./unlocks.ts";
import { recordLogin } from "./quests.ts";
import { log } from "./log.ts";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const DISCORD_REDIRECT_URI =
	process.env.DISCORD_REDIRECT_URI ?? "http://localhost:5173/api/auth/discord/callback";

/**
 * Discord is the only login method, so a misconfigured production deployment
 * should be loud rather than silently failing every login attempt.
 *
 * Called from index.ts rather than run at import time, so it lands inside the
 * boot sequence instead of ahead of the banner.
 */
export function logOAuthConfig(): void {
	if (!isProduction()) {
		log.info("boot", "discord oauth: dev mode, redirect " + DISCORD_REDIRECT_URI);
		return;
	}
	if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
		log.warn("oauth", "DISCORD_CLIENT_ID/SECRET is empty — Discord login will NOT work");
	} else if (DISCORD_REDIRECT_URI.includes("localhost")) {
		log.warn("oauth", `DISCORD_REDIRECT_URI still points at localhost (${DISCORD_REDIRECT_URI})`);
	} else {
		log.info("boot", `discord oauth: configured (${DISCORD_REDIRECT_URI})`);
	}
}

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

		const isPopupFlow = c.req.query("popup") === "1";
		// carry the popup flag inside the state value: Discord echoes state back on
		// the callback, so popup mode is detected even if the oauth_popup cookie is
		// dropped on the round-trip (e.g. cross-site cookie restrictions). Without
		// this the callback would fall back to a redirect and load the game inside
		// the popup instead of closing it.
		const state = isPopupFlow ? `${generateState()}.p` : generateState();
		const url = new URL(DISCORD_AUTH_URL);
		url.searchParams.set("client_id", DISCORD_CLIENT_ID);
		url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", "identify");
		url.searchParams.set("state", state);
		// NB: do NOT set prompt=none here. With prompt=none Discord refuses to show
		// the consent screen and instead returns an error for anyone who hasn't
		// already authorized the app (i.e. every first-time login), which silently
		// breaks the flow. The default prompt auto-approves returning users anyway.

		const secure = isProduction() ? "; Secure" : "";
		c.header(
			"Set-Cookie",
			`oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
			{ append: true },
		);
		// popup mode: the callback answers with a self-closing page instead of a redirect
		if (isPopupFlow) {
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
		// the state carries a ".p" suffix in popup mode (see /auth/discord); trust it
		// as a fallback so a lost oauth_popup cookie never navigates the popup to the game
		const isPopup = cookies.oauth_popup === "1" || (state?.endsWith(".p") ?? false);
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
			// Notify the opener (fast path) and close. window.opener is frequently
			// null here because discord.com sends COOP: same-origin, which severs the
			// popup from its opener on the round-trip. That's fine: the session cookie
			// is already set on this domain, and the opener polls /api/auth/me to pick
			// it up. So we must NOT navigate the popup to the game as a fallback —
			// that's what made the popup "reopen the game". We just close (or, if the
			// browser blocks close, show a done message).
			return c.html(
				`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding-top:40px">
					<script>
						try {
							if (window.opener && !window.opener.closed) {
								window.opener.postMessage(${message}, "*");
							}
						} catch (e) {}
						window.close();
					</script>
					${err ? "Discord login failed. You can close this window." : "Login complete — you can close this window."}
				</body></html>`,
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
			const isNewAccount = !user;

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

			log.info("login", `${user.username} signed in via Discord${isNewAccount ? " (new account)" : ""}`);

			const cookie = await createSessionCookie(user.id, user.username);
			// append: a Set-Cookie header clearing oauth_state is already present
			c.header("Set-Cookie", cookie, { append: true });
			recordLogin(user.id);
			return finish(null);
		} catch (err) {
			log.error("oauth", `login failed: ${err instanceof Error ? err.message : String(err)}`);
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

	return app;
}
