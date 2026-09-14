import type { NetSnapshot } from "../types.ts";

/**
 * Snapshot interpolation for remote players.
 *
 * The server broadcasts positions on a fixed tick; the client renders on rAF.
 * Assigning a remote player's position straight from each packet — which is what
 * this replaces — made them advance in discrete jumps at the network's cadence
 * while the local player moved every frame. Rendering a fixed delay behind the
 * newest snapshot and interpolating between the two that bracket that moment
 * turns those ticks back into continuous motion.
 *
 * Kept separate from app.tsx so the maths is testable on its own.
 */

/** Shortest-path interpolation between two angles in degrees. */
export function interpolateAngle(from: number, to: number, ratio: number): number {
	let difference = (to - from) % 360;
	if (difference > 180) difference -= 360;
	if (difference < -180) difference += 360;
	return from + difference * ratio;
}

export type SampledPose = { x: number; y: number; jumpY: number; angle: number };

/**
 * Resolves a player's pose at `renderTime` from their snapshot buffer.
 *
 * - Between two snapshots: linear interpolation (the normal case).
 * - Before the oldest: that oldest snapshot, so a freshly-spawned player appears
 *   where the server put them rather than sliding in from nowhere.
 * - Past the newest: brief linear extrapolation along the last known velocity,
 *   capped at `maxExtrapolateMs`, then hold. This covers a short packet gap
 *   without letting a disconnected player drift away across the map.
 *
 * @param buffer snapshots in arrival order, oldest first
 * @returns the pose, or null if the buffer is empty
 */
export function sampleSnapshots(
	buffer: NetSnapshot[],
	renderTime: number,
	maxExtrapolateMs: number,
): SampledPose | null {
	if (buffer.length === 0) return null;

	let olderIndex = -1;
	let newer: NetSnapshot | undefined;
	for (let i = 0; i < buffer.length; i++) {
		if (buffer[i].t <= renderTime) {
			olderIndex = i;
		} else {
			newer = buffer[i];
			break;
		}
	}
	const older = olderIndex >= 0 ? buffer[olderIndex] : undefined;

	if (older && newer) {
		const span = newer.t - older.t;
		const ratio = span > 0 ? (renderTime - older.t) / span : 1;
		return {
			x: older.x + (newer.x - older.x) * ratio,
			y: older.y + (newer.y - older.y) * ratio,
			jumpY: older.jumpY + (newer.jumpY - older.jumpY) * ratio,
			angle: interpolateAngle(older.angle, newer.angle, ratio),
		};
	}

	if (newer) {
		// renderTime predates everything we hold
		return { x: newer.x, y: newer.y, jumpY: newer.jumpY, angle: newer.angle };
	}

	// buffer ran dry: extrapolate briefly from the last two samples, then hold
	const last = older!;
	const prior = buffer[olderIndex - 1];
	const ahead = Math.min(renderTime - last.t, maxExtrapolateMs);
	if (prior && last.t > prior.t && ahead > 0) {
		const span = last.t - prior.t;
		return {
			x: last.x + ((last.x - prior.x) / span) * ahead,
			y: last.y + ((last.y - prior.y) / span) * ahead,
			jumpY: last.jumpY,
			angle: last.angle,
		};
	}
	return { x: last.x, y: last.y, jumpY: last.jumpY, angle: last.angle };
}

/**
 * Drops snapshots already played well past, in place.
 *
 * Always leaves at least two entries so the next frame still has a pair to
 * interpolate between (and something to extrapolate from if packets stop).
 */
export function pruneSnapshots(buffer: NetSnapshot[], renderTime: number, keepMs: number): void {
	while (buffer.length > 2 && buffer[1].t < renderTime - keepMs) {
		buffer.shift();
	}
}
