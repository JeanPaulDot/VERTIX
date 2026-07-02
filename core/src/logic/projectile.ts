import { playSound } from "../sound.ts";
import { st } from "../state.svelte.ts";
import type { ClutterObject, Player, Tile } from "../types.ts";
import { dotInRect, getDistance, randomInt } from "../utils.ts";
import { createLiquid, particleCone, stillDustParticle } from "../visual/particle.ts";

const EXPLOSIVE_CLUTTER_INDEX = 2;
const BOUNCE_SPEED_RETENTION = 0.65;
const BULLET_IMMUNITY_MS = 250;
const LINE_INTERSECTION_EPSILON = 1e-7;
const COLLISION_ADJUST_ATTEMPTS = 100;
const COLLISION_ADJUST_STEP = 2;

export class Projectile {
	width = 0;
	height = 0;
	jumpY = 0;
	yOffset = 0;
	dir = 0;
	cEndX = 0;
	cEndY = 0;
	startX = 0;
	startY = 0;
	y = 0;
	x = 0;
	active = false;
	weaponIndex = 0;
	spriteIndex = 0;
	pierceCount = 0;
	blastRadius: number | undefined = 0;
	glowHeight = 0;
	glowWidth = 0;
	speed = 0;
	trailWidth = 0;
	trailMaxLength = 0;
	trailAlpha = 0;
	owner: Player | null = null;
	dmg = 0;
	hitClutter: number[] = [];
	hitPlayers: number[] = [];
	playerImmunity: Record<number, number> = {};
	serverIndex = 0;
	skipMove = true;
	startTime = 0;
	maxLifeTime: number | null = 0;
	explodeOnDeath = false;
	collidesWithExplosiveClutter = false;
	updateAccuracy = 3;
	bounce = false;
	dustTimer = 0;
	selfDamage = false;
	update(
		delta: number,
		currentTime: number,
		clutter: ClutterObject[],
		tiles: Tile[],
		players: Player[],
	) {
		if (this.active) {
			let lifetime = currentTime - this.startTime;
			if (this.skipMove) {
				lifetime = 0;
				this.startTime = currentTime;
			}

			this.hitClutter = [];
			this.hitPlayers = [];

			for (let updateStep = 0; updateStep < this.updateAccuracy; ++updateStep) {
				let vel = this.speed * delta;

				for (const playerIndex in this.playerImmunity) {
					this.playerImmunity[playerIndex] -= delta / 3;
					if (this.playerImmunity[playerIndex] < 0) {
						delete this.playerImmunity[playerIndex];
					}
				}

				if (this.active) {
					let changeX = (vel * Math.cos(this.dir)) / this.updateAccuracy;
					let changeY = (vel * Math.sin(this.dir)) / this.updateAccuracy;

					if (this.active && !this.skipMove && this.speed > 0) {
						this.x += changeX;
						this.y += changeY;
						if (getDistance(this.startX, this.startY, this.x, this.y) >= this.trailMaxLength) {
							this.startX += changeX;
							this.startY += changeY;
						}
					}

					this.cEndX = this.x + ((vel + this.height) * Math.cos(this.dir)) / this.updateAccuracy;
					this.cEndY = this.y + ((vel + this.height) * Math.sin(this.dir)) / this.updateAccuracy;

					for (const [i, clt] of clutter.entries()) {
						if (
							this.active &&
							clt.active &&
							clt.hc &&
							this.canSeeObject(clt, clt.h) &&
							clt.h * clt.tp >= this.yOffset &&
							this.lineInRect(clt.x, clt.y - clt.h, clt.w, clt.h * 0.7, true)
						) {
							if (this.bounce) {
								this.bounceDir(this.cEndY <= clt.y - clt.h || this.cEndY >= clt.y - clt.h * 0.3);
							} else {
								this.handleClutterHit(clt, i);
							}
						}
					}
					if (this.active) {
						for (const tl of tiles) {
							if (this.active) {
								if (tl.wall && tl.hasCollision && this.canSeeObject(tl, tl.scale)) {
									if (tl.bottom) {
										if (this.lineInRect(tl.x, tl.y, tl.scale, tl.scale, true)) {
											this.active = false;
										}
									} else if (
										this.lineInRect(
											tl.x,
											tl.y,
											tl.scale,
											tl.scale - this.owner!.height - this.jumpY,
											true,
										)
									) {
										this.active = false;
									}
									if (!this.active) {
										if (this.bounce) {
											this.bounceDir(!(this.cEndX <= tl.x) && !(this.cEndX >= tl.x + tl.scale));
										} else {
											this.hitSomething(
												!(this.cEndX <= tl.x) && !(this.cEndX >= tl.x + tl.scale),
												2,
											);
										}
									}
								}
							}
						}
					}
					if (
						this.active &&
						(typeof window === "undefined" || this.owner!.index === st.player.index)
					) {
						for (const pl of players) {
							if (
								pl.index === this.owner!.index ||
								this.hitPlayers.includes(pl.index) ||
								Object.hasOwn(this.playerImmunity, pl.index) ||
								pl.team === this.owner!.team ||
								!pl.onScreen ||
								pl.dead
							) {
								continue;
							}
							if (
								this.lineInRect(
									pl.x - pl.width / 2,
									pl.y - pl.height - pl.jumpY,
									pl.width,
									pl.height,
									this.pierceCount <= 1,
								) &&
								!pl.isSpawnProtected
							) {
								if (this.explodeOnDeath || this.collidesWithExplosiveClutter) {
									this.active = false;
								} else if (this.dmg > 0) {
									this.hitPlayers.push(pl.index);
									this.playerImmunity[pl.index] = BULLET_IMMUNITY_MS;
									if (this.spriteIndex !== 2 && typeof window !== "undefined") {
										particleCone(
											12,
											pl.x,
											pl.y - pl.height / 2 - pl.jumpY,
											this.dir + Math.PI,
											Math.PI / randomInt(5, 7),
											0.5,
											16,
											0,
											true,
										);
										createLiquid(pl.x, pl.y, this.dir, 4);
									}
									if (this.pierceCount > 0) this.pierceCount--;
									if (this.pierceCount <= 0) this.active = false;
								}
							}
							if (!this.active) break;
						}
					}
					if (this.maxLifeTime != null && lifetime >= this.maxLifeTime) {
						this.active = false;
					}
					if (!this.active && this.explodeOnDeath && !this.collidesWithExplosiveClutter) {
						for (const [i, clt] of clutter.entries()) {
							if (
								clt.active &&
								clt.hc &&
								this.canSeeObject(clt, clt.h) &&
								clt.h * clt.tp >= this.yOffset &&
								this.isInExplosionRange(clt)
							) {
								this.handleClutterHit(clt, i);
							}
						}
					}
				}
			}
			if (this.spriteIndex === 1) {
				this.dustTimer -= delta;
				if (this.dustTimer <= 0 && typeof window !== "undefined") {
					stillDustParticle(this.x, this.y, true);
					this.dustTimer = 20;
				}
			}
		} else if (this.trailAlpha > 0) {
			this.trailAlpha -= delta * 0.001;
			if (this.trailAlpha <= 0) {
				this.trailAlpha = 0;
			}
		}
		this.skipMove = false;
	}
	activate() {
		this.skipMove = true;
		this.hitClutter = [];
		this.hitPlayers = [];
		this.playerImmunity = {};
		this.active = true;
		if (typeof window !== "undefined") playSound(`shot${this.weaponIndex}`, this.x, this.y);
	}
	canSeeObject(target: ClutterObject | Tile, size: number) {
		const xDistance = Math.abs(this.cEndX - target.x);
		const yDistance = Math.abs(this.cEndY - target.y);
		return xDistance <= (size + this.height) * 2 && yDistance <= (size + this.height) * 2;
	}
	deactivate() {
		this.active = false;
	}
	hitSomething(flipY: boolean, spriteType: number) {
		if (this.spriteIndex !== 2 && typeof window !== "undefined") {
			particleCone(
				10,
				this.cEndX,
				this.cEndY,
				this.dir + Math.PI,
				Math.PI / randomInt(5, 7),
				0.5,
				16,
				spriteType,
				flipY,
			);
		}
	}
	bounceDir(flipY: boolean) {
		this.dir = flipY ? Math.PI * 2 - this.dir : Math.PI - this.dir;
		this.active = true;
		this.speed *= BOUNCE_SPEED_RETENTION;
		this.x = this.cEndX;
		this.y = this.cEndY;
	}
	lineInRect(
		rectX: number,
		rectY: number,
		rectWidth: number,
		rectHeight: number,
		shouldAdjustOnCollision: boolean,
	) {
		let lineStartX = this.x;
		let lineStartY = this.y;
		let minX = lineStartX;
		let maxX = this.cEndX;
		if (minX > maxX) {
			minX = this.cEndX;
			maxX = lineStartX;
		}
		if (maxX > rectX + rectWidth) {
			maxX = rectX + rectWidth;
		}
		if (minX < rectX) {
			minX = rectX;
		}
		if (minX > maxX) {
			return false;
		}
		let minY = lineStartY;
		let maxY = this.cEndY;
		let lineDeltaX = this.cEndX - lineStartX;
		if (Math.abs(lineDeltaX) > LINE_INTERSECTION_EPSILON) {
			maxY = (this.cEndY - lineStartY) / lineDeltaX;
			lineStartX = lineStartY - maxY * lineStartX;
			minY = maxY * minX + lineStartX;
			maxY = maxY * maxX + lineStartX;
		}
		if (minY > maxY) {
			minX = maxY;
			maxY = minY;
			minY = minX;
		}
		if (maxY > rectY + rectHeight) {
			maxY = rectY + rectHeight;
		}
		if (minY < rectY) {
			minY = rectY;
		}
		if (minY > maxY) {
			return false;
		}
		if (shouldAdjustOnCollision) {
			this.adjustOnCollision(rectX, rectY, rectWidth, rectHeight);
		}
		return true;
	}
	adjustOnCollision(rectX: number, rectY: number, rectWidth: number, rectHeight: number) {
		let collisionX = this.cEndX;
		let collisionY = this.cEndY;
		const reverseDirection = this.dir + Math.PI;
		const stepX = Math.cos(reverseDirection) * COLLISION_ADJUST_STEP;
		const stepY = Math.sin(reverseDirection) * COLLISION_ADJUST_STEP;
		for (let attempts = COLLISION_ADJUST_ATTEMPTS; attempts > 0; attempts--) {
			if (dotInRect(collisionX, collisionY, rectX, rectY, rectWidth, rectHeight)) {
				break;
			}
			collisionX += stepX;
			collisionY += stepY;
		}
		for (let attempts = COLLISION_ADJUST_ATTEMPTS; attempts > 0; attempts--) {
			if (dotInRect(collisionX, collisionY, rectX, rectY, rectWidth, rectHeight)) {
				collisionX += stepX;
				collisionY += stepY;
			} else {
				break;
			}
		}
		this.cEndX = collisionX;
		this.cEndY = collisionY;
		this.x = this.cEndX;
		this.y = this.cEndY;
	}
	isInExplosionRange(clt: ClutterObject) {
		const distToClutter = getDistance(
			this.x + clt.w / 2,
			this.y,
			clt.x + clt.w / 2,
			clt.y - clt.h / 2,
		);
		return distToClutter <= this.blastRadius!;
	}
	handleClutterHit(clt: ClutterObject, i: number) {
		this.active = false;
		if (clt.i === EXPLOSIVE_CLUTTER_INDEX) {
			this.collidesWithExplosiveClutter = true;
			this.hitClutter.push(i);
		}
		this.hitSomething(
			this.cEndX > clt.x && this.cEndX < clt.x + clt.w && this.cEndY > clt.y - clt.h,
			2,
		);
	}
}
