// Admin API client. Two auth paths, matching the server:
//   - ADMIN_TOKEN stored in localStorage, sent as a Bearer header (break-glass)
//   - the normal vertix_session cookie, when the signed-in account has a
//     mod/admin role — the browser sends it same-origin automatically
// A 401 means neither worked; the app shows the unlock screen.

const TOKEN_KEY = "vertix_admin_token";

export function getAdminToken(): string {
	try {
		return localStorage.getItem(TOKEN_KEY) ?? "";
	} catch {
		return "";
	}
}

export function setAdminToken(token: string): void {
	try {
		localStorage.setItem(TOKEN_KEY, token);
	} catch {
		/* private mode etc. — session-cookie auth still works */
	}
}

export function clearAdminToken(): void {
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* ignore */
	}
}

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function request<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
	const headers: Record<string, string> = {};
	const token = getAdminToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	const res = await fetch(`/api/admin${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) {
		let message = `HTTP ${res.status}`;
		try {
			const data = (await res.json()) as { error?: string };
			if (data?.error) message = data.error;
		} catch {
			/* non-JSON error body */
		}
		throw new ApiError(message, res.status);
	}
	return (await res.json()) as T;
}

export const adminApi = {
	get: <T>(path: string) => request<T>(path, "GET"),
	post: <T>(path: string, body?: unknown) => request<T>(path, "POST", body ?? {}),
};

// --- shared overview types (AdminApp polls, panels consume) --------------------

export type AdminPlayer = {
	name: string;
	human: boolean;
	team: string;
	score: number;
	kills: number;
	deaths: number;
	isBoss: boolean;
	connected: boolean;
	userId: number | null;
	account: string | null;
	ip: string | null;
	sessionFor: string | null;
	banned: boolean;
	muted: boolean;
};

export type AdminRoom = {
	name: string;
	mode: string;
	modeName: string;
	permanent: boolean;
	occupancy: string;
	maxPlayers: number;
	bots: number;
	leaderboardScore: number;
	players: AdminPlayer[];
};

export type AdminOverview = {
	server: {
		rooms: number;
		humans: number;
		bots: number;
		lobby: number;
		maintenance: boolean;
		logLevel: string;
		generatedAt: string;
	};
	rooms: AdminRoom[];
	lobby: { username: string; ip: string; connectedFor: string }[];
};

/** prompt() that returns null on cancel and trims; "" still means "cancelled" for us. */
export function ask(message: string, fallback = ""): string | null {
	const value = window.prompt(message, fallback);
	return value === null ? null : value.trim();
}

/** confirm() wrapper so call sites read as sentences. */
export function confirmAction(message: string): boolean {
	return window.confirm(message);
}
