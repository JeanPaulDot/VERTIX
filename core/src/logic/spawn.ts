/**
 * Spawn-point selection.
 *
 * Pulled out of Game.getSpawn so the rule that actually matters — spread players
 * out, and never hand the whole lobby the same square — is testable without a
 * Game, a map or a socket.
 */

export type SpawnCandidate = { x: number; y: number };
export type AvoidPosition = { x: number; y: number };

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
	const dx = ax - bx;
	const dy = ay - by;
	return dx * dx + dy * dy;
}

/**
 * Picks the candidate furthest from everyone in `avoid`.
 *
 * `startIndex` rotates where the scan begins. That is not cosmetic: at the start
 * of a round nobody is alive yet, so `avoid` is empty and every candidate ties.
 * Whichever candidate is examined first wins the tie, so a fixed start index
 * spawned every player in the room on the same tile — which is exactly what the
 * original `Math.min(...[]) === Infinity` implementation did.
 *
 * Comparison is on squared distance: the ordering is identical and it skips a
 * Math.sqrt per candidate per player.
 */
export function chooseSpawn(
	candidates: readonly SpawnCandidate[],
	avoid: readonly AvoidPosition[],
	startIndex = 0,
): SpawnCandidate | null {
	if (candidates.length === 0) return null;
	const offset =
		((startIndex % candidates.length) + candidates.length) % candidates.length;

	let best: SpawnCandidate | null = null;
	let bestDistance = -Infinity;
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[(offset + i) % candidates.length];
		let closest = Infinity;
		for (const other of avoid) {
			const distance = squaredDistance(other.x, other.y, candidate.x, candidate.y);
			if (distance < closest) closest = distance;
		}
		if (closest > bestDistance) {
			best = candidate;
			bestDistance = closest;
		}
	}
	return best;
}
