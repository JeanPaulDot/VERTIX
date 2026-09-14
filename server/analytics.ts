// Async analytics writer.
//
// The game is event-driven (socket handlers + timers) and better-sqlite3 is
// synchronous, so a DB write performed inline inside a handler blocks the event
// loop for its whole duration. Instead, handlers enqueue a tiny event (O(1), no
// I/O) and the queue is flushed in ONE batched transaction on the next
// event-loop tick. Per-frame work (movement, shooting, position ticks) never
// touches the database.
//
// This is intentionally a same-thread batched queue rather than a worker thread:
// it gives the same practical guarantee (no per-event blocking) with none of the
// worker/loader lifecycle risk. If a later phase adds high-volume events (kill
// events), those can move to a worker thread or a chunked flush without changing
// this interface.

import { getDb } from "./db.ts";
import { log } from "./log.ts";

type AnalyticsEvent =
	| {
			type: "session_start";
			id: string;
			userId: number | null;
			username: string;
			ip: string;
			userAgent: string;
			room: string;
			startedAt: number;
	  }
	| {
			type: "session_end";
			id: string;
			userId: number | null;
			endedAt: number;
			durationSeconds: number;
	  };

const queue: AnalyticsEvent[] = [];
let flushScheduled = false;

function scheduleFlush(): void {
	if (flushScheduled) return;
	flushScheduled = true;
	// defer to the next macrotask so the current game event (and any synchronous
	// follow-ups) finish before we spend any time writing
	setImmediate(flush);
}

function flush(): void {
	flushScheduled = false;
	if (queue.length === 0) return;
	const batch = queue.splice(0, queue.length);
	try {
		const db = getDb();
		db.transaction(() => {
			for (const event of batch) write(db, event);
		})();
	} catch (err) {
		log.error("analytics", `flush failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

function write(db: ReturnType<typeof getDb>, event: AnalyticsEvent): void {
	if (event.type === "session_start") {
		db.prepare(
			"INSERT OR IGNORE INTO sessions (id, user_id, username, ip, user_agent, room, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).run(event.id, event.userId, event.username, event.ip, event.userAgent, event.room, event.startedAt);

		db.prepare(
			"INSERT INTO user_ips (username, ip, first_seen, last_seen, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(username, ip) DO UPDATE SET last_seen = excluded.last_seen, count = count + 1",
		).run(event.username, event.ip, event.startedAt, event.startedAt);

		if (event.userId != null) {
			db.prepare(
				"INSERT INTO user_activity (user_id, first_seen, last_seen, session_count, play_time_seconds, last_ip) VALUES (?, ?, ?, 1, 0, ?) ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen, session_count = session_count + 1, last_ip = excluded.last_ip",
			).run(event.userId, event.startedAt, event.startedAt, event.ip);
		}
	} else if (event.type === "session_end") {
		db.prepare("UPDATE sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?").run(
			event.endedAt,
			event.durationSeconds,
			event.id,
		);

		if (event.userId != null) {
			db.prepare("UPDATE user_activity SET play_time_seconds = play_time_seconds + ? WHERE user_id = ?").run(
				event.durationSeconds,
				event.userId,
			);
		}
	}
}

export function trackSessionStart(opts: {
	id: string;
	userId: number | null;
	username: string;
	ip: string;
	userAgent: string;
	room: string;
	startedAt: number;
}): void {
	queue.push({ type: "session_start", ...opts });
	scheduleFlush();
}

export function trackSessionEnd(opts: {
	id: string;
	userId: number | null;
	endedAt: number;
	durationSeconds: number;
}): void {
	queue.push({ type: "session_end", ...opts });
	scheduleFlush();
}

/** Synchronously drains any queued events — called once on shutdown. */
export function flushAnalytics(): void {
	flush();
}
