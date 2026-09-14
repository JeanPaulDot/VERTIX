/**
 * Motion helpers shared by the menu, the social hub and the admin panel.
 *
 * The CSS half of the system (tokens, keyframes, the `.staggerIn` utility and
 * the global `prefers-reduced-motion` override) lives in `assets/main.css`.
 * This module is for the cases CSS cannot reach: Svelte transition parameters,
 * which are computed in JS and therefore need to know about the preference
 * themselves.
 */

/**
 * Has the viewer asked their OS for less motion?
 *
 * Read per call rather than cached at module load: the setting can change while
 * the page is open, and a stale `true` would leave the whole UI without
 * transitions until reload.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Durations, mirroring the `--dur-*` custom properties in main.css. */
export const DURATION = {
	fast: 120,
	base: 190,
	slow: 300,
	entrance: 420,
} as const;

/** Gap between staggered siblings, mirroring `--stagger`. */
export const STAGGER_MS = 65;

/**
 * Per-item delay for a staggered list, capped so a long list does not take
 * several seconds to finish arriving.
 */
export function staggerDelay(index: number, max = 8): number {
	if (prefersReducedMotion()) return 0;
	return Math.min(index, max) * STAGGER_MS;
}
