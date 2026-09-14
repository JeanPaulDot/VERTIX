import type { Namespace } from "socket.io";

/**
 * Live "who is playing right now" for the social hub.
 *
 * Before this, the social pages asked `GET /api/friends` and got a snapshot —
 * they had no socket at all, so presence was whatever was true when you last
 * pressed refresh. The menu already holds a socket on the root ("lobby")
 * namespace, so presence rides that instead.
 *
 * This module deliberately knows nothing about Room: index.ts hands it a builder
 * during boot. Importing `rooms` here would close an import cycle with room.ts,
 * which calls notifyPresenceChanged().
 */

export type PresenceEntry = {
	/** display name — whatever the player typed, and not proof of identity */
	name: string;
	/**
	 * Account username, present only for signed-in players. Matching presence on
	 * `name` is what let any guest appear as someone else in their friends' list.
	 */
	account: string | null;
	room: string;
	mode: string;
	/** false for private rooms, whose rounds do not count toward stats */
	ranked: boolean;
};

type PresenceBuilder = () => PresenceEntry[];

/**
 * Changes arrive in bursts — a round transition respawns everyone, and a full
 * room emptying fires eight disconnects in a few milliseconds. Coalesce them.
 */
const PRESENCE_DEBOUNCE_MS = 400;

let namespace: Namespace | null = null;
let build: PresenceBuilder | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

export function initPresence(ns: Namespace, builder: PresenceBuilder): void {
	namespace = ns;
	build = builder;
}

/** The current list, for a socket that has just connected. */
export function presenceSnapshot(): PresenceEntry[] {
	return build ? build() : [];
}

/** Something changed — a join, a leave, or a mode rotation. */
export function notifyPresenceChanged(): void {
	if (!namespace || !build || pending) return;
	pending = setTimeout(() => {
		pending = null;
		if (!namespace || !build) return;
		namespace.emit("presence", build());
	}, PRESENCE_DEBOUNCE_MS);
}

/** Cancels the pending broadcast so a shutdown does not keep the loop alive. */
export function stopPresence(): void {
	if (pending) clearTimeout(pending);
	pending = null;
	namespace = null;
	build = null;
}
