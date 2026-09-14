// Structured console logging for the server.
//
// The point of this module is signal-to-noise when tailing `docker compose logs`.
// Before it, the only output was a kill line per kill and a join line per bot —
// with 9 permanent rooms of bots fighting each other around the clock, that
// buried everything that actually mattered (boot, room lifecycle, real players).
//
// Levels are controlled by LOG_LEVEL (debug|info|warn|error, default info):
//   debug — bot spawns, bot-vs-bot kills, per-round map picks
//   info  — boot, real players joining/leaving, rooms opening/closing, status
//   warn  — anti-cheat rejections, misconfiguration
//   error — failures

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel(raw: string | undefined): LogLevel {
	return LEVEL_ORDER[(raw ?? "info").toLowerCase() as LogLevel] === undefined
		? "info"
		: ((raw ?? "info").toLowerCase() as LogLevel);
}

// Mutable so the admin panel can change verbosity at runtime without a
// restart — the old const meant LOG_LEVEL was frozen for the process lifetime.
let currentLevel: LogLevel = resolveLevel(process.env.LOG_LEVEL);
let threshold = LEVEL_ORDER[currentLevel];

export function setLogLevel(level: LogLevel): boolean {
	if (LEVEL_ORDER[level] === undefined) return false;
	currentLevel = level;
	threshold = LEVEL_ORDER[level];
	return true;
}

// ANSI colour only when attached to a terminal. `docker compose logs` is not a
// TTY, so production output stays plain and greppable.
const useColor = process.stdout.isTTY === true;
const COLORS: Record<LogLevel, string> = {
	debug: "\x1b[90m",
	info: "\x1b[36m",
	warn: "\x1b[33m",
	error: "\x1b[31m",
};
const RESET = "\x1b[0m";

function timestamp(): string {
	// HH:MM:SS is enough — docker stamps the date, and short lines stay readable
	return new Date().toISOString().slice(11, 19);
}

function emit(level: LogLevel, tag: string, message: string) {
	if (LEVEL_ORDER[level] < threshold) return;
	const label = `[${tag}]`.padEnd(10);
	const line = `${timestamp()} ${label} ${message}`;
	const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
	write(useColor ? `${COLORS[level]}${line}${RESET}` : line);
}

export const log = {
	debug: (tag: string, message: string) => emit("debug", tag, message),
	info: (tag: string, message: string) => emit("info", tag, message),
	warn: (tag: string, message: string) => emit("warn", tag, message),
	error: (tag: string, message: string) => emit("error", tag, message),
	/** Un-timestamped, un-prefixed line — for the boot banner only. */
	raw: (message: string) => console.log(message),
	get level(): LogLevel {
		return currentLevel;
	},
};

/** "2h14m" / "6m03s" / "12s" — compact durations for uptime and session lengths. */
export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
	if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
	return `${seconds}s`;
}
