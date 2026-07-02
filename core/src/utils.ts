import type { Projectile } from "./logic/projectile.ts";
import { st } from "./state.svelte.ts";
import type { ClutterObject, FlagObject, GenData, Player, ShootEvent, Tile } from "./types.ts";

var bulletIndex = 0;
export function getNextBullet(bullets: Projectile[]) {
	bulletIndex++;
	if (bulletIndex >= bullets.length) {
		bulletIndex = 0;
	}
	return bullets[bulletIndex];
}
export function shootNextBullet(
	init: Omit<ShootEvent, "i"> & { i?: number },
	source: Player,
	targetD: number,
	currentTime: number,
	bullet: Projectile,
) {
	let weapon = getCurrentWeapon(source);
	if (!bullet) {
		console.error("invalid bullet passed to shootNextBullet?");
		return;
	}
	bullet.serverIndex = init.si;
	bullet.x = init.x - 1;
	bullet.startX = init.x;
	bullet.y = init.y;
	bullet.startY = init.y;
	bullet.dir = init.d;
	bullet.speed = weapon.bSpeed;
	bullet.updateAccuracy = weapon.cAcc;
	bullet.width = weapon.bWidth;
	bullet.height = weapon.bHeight;
	let randScale = weapon.bRandScale;
	if (randScale != null) {
		let rand = randomFloat(randScale[0], randScale[1]);
		bullet.width *= rand;
		bullet.height *= rand;
		bullet.speed *= 1 + weapon.spread[weapon.spreadIndex];
	}
	bullet.trailWidth = bullet.width * 0.7;
	bullet.trailMaxLength = Math.round(bullet.height * 5);
	bullet.trailAlpha = weapon.bTrail;
	bullet.weaponIndex = weapon.weaponIndex;
	bullet.spriteIndex = weapon.bSprite;
	bullet.yOffset = weapon.yOffset;
	bullet.jumpY = source.jumpY;
	bullet.owner = source;
	bullet.dmg = weapon.dmg;
	bullet.bounce = weapon.bounce;
	bullet.startTime = currentTime;
	bullet.maxLifeTime = weapon.maxLife;
	if (weapon.distBased) {
		bullet.maxLifeTime = targetD / bullet.speed;
	}
	bullet.glowWidth = weapon.glowWidth;
	bullet.glowHeight = weapon.glowHeight;
	bullet.explodeOnDeath = weapon.explodeOnDeath;
	bullet.pierceCount = weapon.pierce;
	bullet.blastRadius = weapon.blastRadius;
	bullet.selfDamage = !!weapon.selfDamage;
	bullet.activate();
}
export function snapAngleToCardinal(angle: number) {
	return Math.round((angle % 360) / 90) * 90;
}
export function isWeaponFacingFront(snappedAngle: number) {
	return snappedAngle !== 180;
}
const FLAG_WIDTH = 70;
const FLAG_HEIGHT = 152;
const FLAG_OFFSET = 40;
const FLAG_EDGE_INSET = 30;
function pushFlag(flags: FlagObject[], tile: Tile, xOffset: number, yOffset: number) {
	flags.push({
		team: tile.objTeam,
		x: tile.x + xOffset,
		y: tile.y + yOffset,
		active: true,
		w: FLAG_WIDTH,
		h: FLAG_HEIGHT,
		ai: randomInt(0, 2),
		ac: 0,
	});
}
export function setupMap(gameMap: any, mapTileScale: number, flags: FlagObject[]) {
	const genData = gameMap.genData;
	const startX = -(mapTileScale * 2);
	const startY = -(mapTileScale * 2);
	let tileIndex = 0;
	const tilePerCol = genData.height;
	gameMap.tilePerCol = tilePerCol;
	gameMap.width = (genData.width - 4) * mapTileScale;
	gameMap.height = (genData.height - 4) * mapTileScale;
	gameMap.scoreToWin = gameMap.gameMode.score;
	const tileData = genData.data.data || genData.data;
	for (let col = 0; col < genData.width; col++) {
		for (let row = 0; row < genData.height; row++) {
			const tileDataBaseIdx = (genData.width * row + col) << 2;
			let colorKey = `${tileData[tileDataBaseIdx]} ${tileData[tileDataBaseIdx + 1]} ${tileData[tileDataBaseIdx + 2]}`;
			const newTile: Tile = {
				index: tileIndex,
				scale: mapTileScale,
				x: 0,
				y: 0,
				wall: false,
				spriteIndex: 0,
				left: 0,
				right: 0,
				top: 0,
				bottom: 0,
				topLeft: 0,
				topRight: 0,
				bottomLeft: 0,
				bottomRight: 0,
				neighbours: 0,
				hasCollision: false,
				hardPoint: false,
				objTeam: "e",
				edgeTile: false,
			};
			newTile.x = startX + mapTileScale * col;
			newTile.y = startY + mapTileScale * row;
			if (col === 0 && row === 0) {
				colorKey = "0 0 0";
			}
			let tmpTile: Tile;
			if (colorKey === "0 0 0") {
				newTile.wall = true;
				newTile.hasCollision = true;
				tmpTile = gameMap.tiles[tileIndex - tilePerCol];
				if (tmpTile !== undefined) {
					if (tmpTile.wall) {
						newTile.left = 1;
						newTile.neighbours += 1;
					}
					tmpTile.right = 1;
					tmpTile.neighbours += 1;
				}
				tmpTile = gameMap.tiles[tileIndex - tilePerCol - 1];
				if (tmpTile?.wall) {
					tmpTile.spriteIndex = 0;
				}
				tmpTile = gameMap.tiles[tileIndex - tilePerCol - 1];
				if (tmpTile?.wall) {
					newTile.topLeft = 1;
					tmpTile.bottomRight = 1;
				}
				tmpTile = gameMap.tiles[tileIndex - tilePerCol + 1];
				if (tmpTile !== undefined) {
					tmpTile.topRight = 1;
					if (tmpTile.wall) {
						newTile.bottomLeft = 1;
					}
				}
				tmpTile = gameMap.tiles[tileIndex - 1];
				if (tmpTile !== undefined) {
					if (tmpTile.wall) {
						newTile.top = 1;
						newTile.neighbours += 1;
					}
					tmpTile.bottom = 1;
					tmpTile.neighbours += 1;
				}
				if (col <= 0 || row <= 0 || col >= genData.width - 1 || row >= genData.height - 1) {
					newTile.left = 1;
					newTile.right = 1;
					newTile.top = 1;
					newTile.bottom = 1;
					newTile.neighbours = 4;
					newTile.edgeTile = true;
				}
				/*
				if (n.spriteIndex === 0 && randomInt(0, 2) === 0) {
					n.spriteIndex = randomInt(1, 2);
				}
				*/
			} else {
				newTile.spriteIndex = 0;
				/*
				let rand = randomInt(0, 10);
				if (rand <= 0) {
					n.spriteIndex = 1;
				}
				*/
				newTile.wall = false;
				tmpTile = gameMap.tiles[tileIndex - tilePerCol];
				if (tmpTile?.wall) {
					newTile.left = 1;
					newTile.neighbours += 1;
				}
				tmpTile = gameMap.tiles[tileIndex - 1];
				if (tmpTile?.wall) {
					newTile.top = 1;
					newTile.neighbours += 1;
				}
				tmpTile = gameMap.tiles[tileIndex - tilePerCol - 1];
				if (tmpTile?.wall) {
					newTile.topLeft = 1;
				}
				if (colorKey === "0 255 0") {
					newTile.spriteIndex = 2;
				} else if (colorKey === "255 255 0") {
					if (gameMap.gameMode.name === "Hardpoint" || gameMap.gameMode.name === "Zone War") {
						newTile.hardPoint = true;
						if (gameMap.gameMode.name === "Zone War") {
							newTile.objTeam = col < genData.width / 2 ? "red" : "blue";
						}
					} else {
						newTile.spriteIndex = 1;
					}
				} else if (colorKey === "255 0 0") {
					newTile.objTeam = "red";
				} else if (colorKey === "0 0 255" && gameMap.gameMode.teams) {
					newTile.objTeam = "blue";
				}
			}
			gameMap.tiles.push(newTile);
			tileIndex++;
		}
	}
	// tmpY = tmpShad = null;
	const oppositeOffset = mapTileScale - FLAG_EDGE_INSET - FLAG_OFFSET;
	for (let tileIdx = 0; tileIdx < gameMap.tiles.length; ++tileIdx) {
		const tile = gameMap.tiles[tileIdx];
		if (tile.edgeTile) {
			tile.hasCollision = false;
		} else if (!tile.wall && tile.hardPoint) {
			if (
				canPlaceFlag(gameMap.tiles[tileIdx - tilePerCol], true) &&
				canPlaceFlag(gameMap.tiles[tileIdx - 1], false)
			) {
				pushFlag(flags, tile, FLAG_OFFSET, FLAG_OFFSET);
			}
			if (
				canPlaceFlag(gameMap.tiles[tileIdx + tilePerCol], true) &&
				canPlaceFlag(gameMap.tiles[tileIdx - 1], false)
			) {
				pushFlag(flags, tile, oppositeOffset, FLAG_OFFSET);
			}
			if (
				canPlaceFlag(gameMap.tiles[tileIdx + tilePerCol], true) &&
				canPlaceFlag(gameMap.tiles[tileIdx + 1], false)
			) {
				pushFlag(flags, tile, oppositeOffset, oppositeOffset);
			}
			if (
				canPlaceFlag(gameMap.tiles[tileIdx - tilePerCol], true) &&
				canPlaceFlag(gameMap.tiles[tileIdx + 1], false)
			) {
				pushFlag(flags, tile, FLAG_OFFSET, oppositeOffset);
			}
		}
	}
}
function canPlaceFlag(tile: Tile | undefined, ignoreWalls: boolean) {
	if (ignoreWalls) {
		return tile && !tile.wall && !tile.hardPoint;
	} else {
		return tile && !tile.hardPoint;
	}
}

function touchesTile(x: number, y: number, width: number, tile: Tile) {
	return (
		x + width / 2 >= tile.x &&
		x - width / 2 <= tile.x + tile.scale &&
		y >= tile.y &&
		y <= tile.y + tile.scale
	);
}

function touchesClutter(x: number, y: number, width: number, clt: ClutterObject) {
	return (
		//canSee(clt.x - st.startX, clt.y - st.startY, clt.w, clt.h) &&
		x + width / 2 >= clt.x &&
		x - width / 2 <= clt.x + clt.w &&
		y >= clt.y - (clt.h / 2) * clt.tp &&
		y <= clt.y + (clt.h / 2) * clt.tp
	);
}

export function wallCol(player: Player, tiles: Tile[], clutter: ClutterObject[]) {
	if (player.dead) return;

	const wallCollisionTiles = tiles.filter((tile) => tile.wall && tile.hasCollision);
	const activeCollisionClutter = clutter.filter((clt) => clt.active && clt.hc);

	for (const tile of wallCollisionTiles) {
		if (touchesTile(player.x, player.oldY, player.width, tile)) {
			if (player.oldX + player.width / 2 <= tile.x) {
				player.x = tile.x - player.width / 2 - 2;
			} else if (player.oldX - player.width / 2 >= tile.x + tile.scale) {
				player.x = tile.x + tile.scale + player.width / 2 + 2;
			}
		}
	}
	for (const clt of activeCollisionClutter) {
		if (touchesClutter(player.x, player.oldY, player.width, clt)) {
			if (player.oldX + player.width / 2 <= clt.x) {
				player.x = clt.x - player.width / 2 - 1;
			} else if (player.oldX - player.width / 2 >= clt.x + clt.w) {
				player.x = clt.x + clt.w + player.width / 2 + 1;
			}
		}
	}

	for (const tile of wallCollisionTiles) {
		if (touchesTile(player.x, player.y, player.width, tile)) {
			if (player.oldY <= tile.y) {
				player.y = tile.y - 2;
			} else if (player.oldY >= tile.y + tile.scale) {
				player.y = tile.y + tile.scale + 2;
			}
		}
	}
	for (const clt of activeCollisionClutter) {
		if (touchesClutter(player.x, player.y, player.width, clt)) {
			if (player.oldY >= clt.y + (clt.h / 2) * clt.tp) {
				player.y = clt.y + (clt.h / 2) * clt.tp + 1;
			} else if (player.oldY <= clt.y - (clt.h / 2) * clt.tp) {
				player.y = clt.y - (clt.h / 2) * clt.tp - 1;
			}
		}
	}

	player.nameYOffset = 0;
	const playerHeadY = player.y - player.jumpY - player.height * 0.85;

	for (const tile of wallCollisionTiles) {
		if (
			!tile.hardPoint &&
			player.x > tile.x &&
			player.x < tile.x + tile.scale &&
			playerHeadY > tile.y - tile.scale / 2 &&
			playerHeadY <= tile.y
		) {
			player.nameYOffset = Math.round(playerHeadY - tile.y + tile.scale / 2);
		}
	}
}

export function getCurrentWeapon(player: Player) {
	return player.weapons?.[player.currentWeapon] ?? null;
}
export function roundNumber(num: number, fractionDigits: number) {
	return +num.toFixed(fractionDigits);
}
export function getAngleDifference(angleA: number, angleB: number) {
	const anglDif = Math.abs(angleB - angleA) % (Math.PI * 2);
	if (anglDif > Math.PI) {
		return Math.PI * 2 - anglDif;
	} else {
		return anglDif;
	}
}
export function jsonByteCount(obj: object) {
	return byteCount(JSON.stringify(obj));
}
export function byteCount(str: string) {
	return encodeURI(str).split(/%..|./).length - 1;
}
export function getDistance(x1: number, y1: number, x2: number, y2: number) {
	return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
export function getAngle(x1: number, y1: number, x2: number, y2: number) {
	return Math.atan2(y2 - y1, x2 - x1);
}
export function getShadedRgbComponent(hexComponent: string, percent: number) {
	const hexNumber = parseInt(hexComponent, 16);
	const shadedHexNumber = Math.min(255, Math.round((hexNumber * (100 + percent)) / 100));
	return shadedHexNumber.toString(16).padStart(2, "0");
}
export function shadeColor(hexColor: string, percent: number) {
	const red = getShadedRgbComponent(hexColor.substring(1, 3), percent);
	const green = getShadedRgbComponent(hexColor.substring(3, 5), percent);
	const blue = getShadedRgbComponent(hexColor.substring(5, 7), percent);
	return `#${red}${green}${blue}`;
}
export function randomFloat(min: number, max: number) {
	return min + Math.random() * (max - min);
}
export function randomInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function linearInterpolate(current: number, target: number, step: number) {
	var delta = current - target;
	if (delta * delta > step * step) {
		return target + step;
	} else {
		return current;
	}
}
export function isImageOk(img: HTMLImageElement) {
	return img.complete && img.naturalWidth !== 0;
}
export function canSee(x: number, y: number, width: number, height: number) {
	return x + width > 0 && y + height > 0 && x < st.maxScreenWidth && y < st.maxScreenHeight;
}
export function dotInRect(dotX: number, dotY: number, x: number, y: number, w: number, h: number) {
	return x <= dotX && dotX <= x + w && y <= dotY && dotY <= y + h;
}
export function getItemRarityColor(chance: number) {
	if (chance <= 1) {
		return "#ff8000";
	} else if (chance <= 6) {
		return "#a335ee";
	} else if (chance <= 18) {
		return "#0070dd";
	} else if (chance <= 45) {
		return "#1eff00";
	} else {
		return "#9d9d9d";
	}
}
export async function loadImageData(file: File): Promise<GenData> {
	const dataUrl = await new Promise<string>((resolve) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => resolve(reader.result as string));
		reader.readAsDataURL(file);
	});

	const img = await new Promise<HTMLImageElement>((resolve) => {
		const img = document.createElement("img");
		img.addEventListener("load", () => resolve(img));
		img.src = dataUrl;
	});

	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(img, 0, 0);

	return {
		width: img.width,
		height: img.height,
		data: ctx.getImageData(0, 0, img.width, img.height).data,
	};
}

export const TeamColors = {
	Red: "#d95151",
	Blue: "#5151d9",
};
