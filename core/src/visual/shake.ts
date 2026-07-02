import { st } from "../state.svelte.ts";

const screenSkRed = 0.5;

export function screenShake(scale: number, dir: number) {
	if (st.shake.scale < scale) {
		st.shake.scale = scale;
		st.shake.dir = dir;
	}
}
export function updateScreenShake() {
	if (st.shake.scale > 0) {
		st.shake.x = st.shake.scale * Math.cos(st.shake.dir);
		st.shake.y = st.shake.scale * Math.sin(st.shake.dir);
		st.shake.scale = st.shake.scale * screenSkRed;
		if (st.shake.scale <= 0.1) {
			st.shake.scale = 0;
		}
	}
}
