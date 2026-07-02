import { st } from "../state.svelte.ts";

export class FlashGlow {
	initScale = 0;
	scale = 0;
	y = 0;
	x = 0;
	active = false;
	maxDuration = 0;
	duration = 0;

	update(delta: number) {
		if (!(this.active && this.maxDuration > 0)) return;
		this.duration += delta;
		let tmpScale = Math.max(0, 1 - this.duration / this.maxDuration);
		this.scale = this.initScale * tmpScale;
		if (this.scale < 1) {
			this.active = false;
		}
		if (this.duration >= this.maxDuration) {
			this.active = false;
		}
	}

	draw() {
		if (!this.active) return;
		window.graph.drawImage(
			st.sprites.light!,
			this.x - st.startX - this.scale / 2,
			this.y - st.startY - this.scale / 2,
			this.scale,
			this.scale,
		);
	}
}

var flashGlows: FlashGlow[] = [];
var glowIndex = 0;
for (let i = 0; i < 30; ++i) {
	flashGlows.push(new FlashGlow());
}
export function updateFlashGlows(delta: number) {
	for (const glow of flashGlows) {
		glow.update(delta);
		glow.draw();
	}
}

export function createFlash(x: number, y: number, scale: number) {
	glowIndex++;
	if (glowIndex >= flashGlows.length) {
		glowIndex = 0;
	}
	const glow = flashGlows[glowIndex];
	glow.x = x;
	glow.y = y;
	glow.scale = 0;
	glow.initScale = scale * 220;
	glow.duration = 0;
	glow.maxDuration = 180;
	glow.active = true;
}
