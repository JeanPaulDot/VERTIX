import { playSound } from "../sound.ts";
import { st } from "../state.svelte.ts";
import type { Tile } from "../types.ts";
import { canSee, getAngle, getDistance, isImageOk, randomFloat, randomInt } from "../utils.ts";
import { createFlash } from "./flash.ts";
import { screenShake } from "./shake.ts";

class Particle {
	rotation = 0;
	initScale = 0;
	scale = 0;
	dir = 0;
	initSpeed = 0;
	speed = 0;
	y = 0;
	x = 0;
	active = false;
	layer = 0;
	spriteIndex = 0;
	alpha = 1;
	fadeSpeed = 0;
	forceShow = false;
	checkCollisions = false;
	tmpScale = 0;
	maxDuration = 0;
	duration = 0;
	update(delta: number) {
		if (!this.active) return;
		if (this.maxDuration > 0) {
			this.duration += delta;
			this.tmpScale = 1 - this.duration / this.maxDuration;
			this.tmpScale = this.tmpScale < 0 ? 0 : this.tmpScale;
			this.scale = this.initScale * this.tmpScale;
			if (this.scale < 1) {
				this.active = false;
			}
			this.speed = this.initSpeed * this.tmpScale;
			if (this.speed <= 0.01) {
				this.speed = 0;
			} else {
				this.x += this.speed * delta * Math.cos(this.dir);
				this.y += this.speed * delta * Math.sin(this.dir);
			}
			if (this.duration >= this.maxDuration) {
				this.active = false;
			}
		}
		if (this.alpha > 0) {
			this.alpha -= this.fadeSpeed * delta;
		}
		if (this.alpha <= 0) {
			this.alpha = 0;
			this.active = false;
		}
		if (this.checkCollisions) {
			this.checkInWall();
		}
	}
	draw() {
		if (
			!this.active ||
			!st.sprites.particles[this.spriteIndex] ||
			!isImageOk(st.sprites.particles[this.spriteIndex])
		)
			return;

		window.graph.globalAlpha = this.alpha;
		if (this.rotation !== 0) {
			window.graph.save();
			window.graph.translate(this.x - st.startX, this.y - st.startY);
			window.graph.rotate(this.rotation);
			window.graph.drawImage(
				st.sprites.particles[this.spriteIndex],
				-(this.scale / 2),
				-(this.scale / 2),
				this.scale,
				this.scale,
			);
			window.graph.restore();
		} else {
			window.graph.drawImage(
				st.sprites.particles[this.spriteIndex],
				this.x - st.startX - this.scale / 2,
				this.y - st.startY - this.scale / 2,
				this.scale,
				this.scale,
			);
		}
	}

	checkInWall() {
		st.gameMap.tiles.forEach((tmpTl: Tile) => {
			if (!tmpTl.wall || !tmpTl.hasCollision) return;
			if (
				this.x >= tmpTl.x &&
				this.x <= tmpTl.x + tmpTl.scale &&
				this.y > tmpTl.y &&
				this.y < tmpTl.y + tmpTl.scale - st.player.height
			) {
				this.active = false;
			}
		});
	}
}
var cachedParticles: Particle[] = [];
var particleIndex = 0;
for (let i = 0; i < 700; ++i) {
	cachedParticles.push(new Particle());
}
export function updateParticles(delta: number, layer: number) {
	for (let i = 0; i < cachedParticles.length; ++i) {
		if (
			(st.settings.showParticles || cachedParticles[i].forceShow) &&
			cachedParticles[i].active &&
			canSee(
				cachedParticles[i].x - st.startX,
				cachedParticles[i].y - st.startY,
				cachedParticles[i].scale,
				cachedParticles[i].scale,
			)
		) {
			if (layer === cachedParticles[i].layer) {
				cachedParticles[i].update(delta);
				cachedParticles[i].draw();
			}
		} else {
			cachedParticles[i].active = false;
		}
	}
	window.graph.globalAlpha = 1;
}

function getReadyParticle() {
	particleIndex++;
	if (particleIndex >= cachedParticles.length) {
		particleIndex = 0;
	}
	return cachedParticles[particleIndex];
}
export function particleCone(
	count: number,
	x: number,
	y: number,
	dir: number,
	spread: number,
	speed: number,
	scale: number,
	spriteIndex: number,
	addBulletHole: boolean,
) {
	if (!st.settings.showParticles) return;
	for (let i = 0; i < count; ++i) {
		let tmpParticle = getReadyParticle();
		tmpParticle.forceShow = false;
		tmpParticle.checkCollisions = false;
		tmpParticle.x = x;
		tmpParticle.y = y;
		tmpParticle.rotation = 0;
		tmpParticle.alpha = 1;
		tmpParticle.speed = 0;
		tmpParticle.fadeSpeed = 0;
		tmpParticle.initSpeed = 0;
		tmpParticle.initScale = randomFloat(3, 9);
		tmpParticle.spriteIndex = 0;
		tmpParticle.maxDuration = -1;
		tmpParticle.duration = 0;
		if (i === 0 && spriteIndex === 2 && addBulletHole) {
			tmpParticle.spriteIndex = 3;
			tmpParticle.layer = 0;
		} else {
			tmpParticle.dir = dir + randomFloat(-spread, spread);
			tmpParticle.initScale = scale * randomFloat(1.5, 1.8);
			tmpParticle.initSpeed = speed * randomFloat(0.3, 1.3);
			tmpParticle.maxDuration = randomFloat(0.8, 1.1) * 360;
			tmpParticle.spriteIndex = spriteIndex;
			tmpParticle.layer = randomInt(0, 1);
		}
		tmpParticle.scale = tmpParticle.initScale;
		tmpParticle.active = true;
	}
}
var liquidSpread = 35;
export function createLiquid(x: number, y: number, _dir: number, spriteIndex: number) {
	let tmpParticle = getReadyParticle();
	tmpParticle.x = x + randomFloat(-liquidSpread, liquidSpread);
	tmpParticle.y = y + randomFloat(-liquidSpread, liquidSpread);
	tmpParticle.initSpeed = 0;
	tmpParticle.maxDuration = -1;
	tmpParticle.duration = 0;
	tmpParticle.initScale = randomFloat(60, 150);
	tmpParticle.scale = tmpParticle.initScale;
	tmpParticle.rotation = randomInt(0, 5);
	tmpParticle.alpha = randomFloat(0.3, 0.5);
	tmpParticle.fadeSpeed = 0.00002;
	tmpParticle.checkCollisions = false;
	tmpParticle.spriteIndex = randomInt(spriteIndex, spriteIndex + 1);
	tmpParticle.layer = 0;
	tmpParticle.forceShow = false;
	tmpParticle.active = true;
}
var maxShakeDist = 2000;
var maxExplosionDuration = 400;
var maxShake = 9;

export function createExplosion(x: number, y: number, scale: number) {
	let tmpDist = getDistance(x, y, st.player.x, st.player.y);
	if (tmpDist <= maxShakeDist) {
		let tmpDir = getAngle(x, st.player.x, y, st.player.y);
		screenShake(scale * maxShake * (1 - tmpDist / maxShakeDist), tmpDir);
	}
	playSound("explosion", x, y);
	createSmokePuff(x, y, scale, true, 1);
}
export function createSmokePuff(x: number, y: number, scale: number, hole: boolean, speed: number) {
	createFlash(x, y, scale);
	for (let i = 0; i < 30; ++i) {
		let tmpParticle = getReadyParticle();
		tmpParticle.dir = Math.round(randomFloat(-Math.PI, Math.PI) / (Math.PI / 3)) * (Math.PI / 3);
		tmpParticle.forceShow = true;
		tmpParticle.spriteIndex = 2;
		tmpParticle.checkCollisions = true;
		tmpParticle.alpha = 1;
		tmpParticle.fadeSpeed = 0;
		tmpParticle.initSpeed = 0;
		tmpParticle.maxDuration = -1;
		tmpParticle.duration = 0;
		tmpParticle.layer = 1;
		tmpParticle.rotation = 0;
		if (i === 0 && hole) {
			tmpParticle.x = x;
			tmpParticle.y = y;
			tmpParticle.initScale = randomFloat(50, 60) * scale;
			tmpParticle.rotation = randomInt(0, 5);
			tmpParticle.speed = 0;
			tmpParticle.fadeSpeed = 0.0002;
			tmpParticle.checkCollisions = false;
			tmpParticle.spriteIndex = 6;
			tmpParticle.layer = 0;
		} else if (i <= 10) {
			let tmpDist = i * scale;
			tmpParticle.x = x + tmpDist * Math.cos(tmpParticle.dir);
			tmpParticle.y = y + tmpDist * Math.sin(tmpParticle.dir);
			tmpParticle.initScale = randomFloat(30, 33) * scale;
			tmpParticle.initSpeed = (3 / tmpParticle.initScale) * scale * speed;
			tmpParticle.maxDuration = maxExplosionDuration * 0.8;
		} else {
			let tmpDist = randomFloat(0, 10) * scale;
			tmpParticle.x = x + tmpDist * Math.cos(tmpParticle.dir);
			tmpParticle.y = y + tmpDist * Math.sin(tmpParticle.dir);
			let rand = randomFloat(0.7, 1.4);
			tmpParticle.initScale = scale * 11 * rand;
			tmpParticle.initSpeed = (((12 / tmpParticle.initScale) * scale) / rand) * speed;
			tmpParticle.maxDuration = maxExplosionDuration * rand;
		}
		tmpParticle.scale = tmpParticle.initScale;
		tmpParticle.active = true;
	}
}
export function stillDustParticle(x: number, y: number, force: boolean) {
	let tmpParticle = getReadyParticle();
	tmpParticle.x = x + randomInt(-10, 10);
	tmpParticle.y = y;
	tmpParticle.initScale = randomFloat(18, 25);
	tmpParticle.initSpeed = 0.05;
	tmpParticle.maxDuration = 600;
	tmpParticle.duration = 0;
	tmpParticle.dir = randomFloat(0, Math.PI * 2);
	tmpParticle.rotation = 0;
	tmpParticle.spriteIndex = 2;
	tmpParticle.layer = force ? 1 : 0;
	tmpParticle.alpha = 1;
	tmpParticle.fadeSpeed = 0;
	tmpParticle.checkCollisions = false;
	tmpParticle.forceShow = force;
	tmpParticle.active = true;
}
