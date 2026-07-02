import type { Server, Socket } from "socket.io";
import { gameModes } from "core/src/gamemodes.ts";
import { characterClasses } from "core/src/loadouts.ts";
import type { Projectile } from "core/src/logic/projectile.ts";
import { camos, hats, shirts } from "core/src/skins.ts";
import { sprays } from "core/src/sprays.ts";
import type { PickupObject, Player, ZoneEvent } from "core/src/types.ts";
import {
	dotInRect,
	getCurrentWeapon,
	getDistance,
	getNextBullet,
	roundNumber,
	shootNextBullet,
	wallCol,
} from "core/src/utils.ts";
import { Game } from "./game.ts";
import {
	sanitizeName,
	isValidClassIndex,
	clampNumber,
	isValidHatIndex,
	isValidShirtIndex,
	isValidModeVoteIndex,
	isWithinShootDistance,
	sanitizeChatMessage,
	clampMovementInput,
	createRateLimiter,
} from "./security.ts";
import { saveRoundStats } from "./db.ts";
import {
	attachSocketSession,
	emitAccountStats,
	type AuthenticatedSocket,
} from "./auth.ts";

const chatRateLimiter = createRateLimiter(5, 1000);

const EXPLOSIVE_CLUTTER_HIT_DAMAGE = 100;
const EXPLOSIVE_CLUTTER_BLAST_RADIUS = 200;
const DUCK_HIT_DAMAGE = 330; // ?
const DUCK_HIT_RADIUS = 240; // ?

const SPAWN_PROTECTION_DURATION = 2000;

const LOOTCRATE_POINTS = 100;
const MAX_ACTIVE_LOOT = 3;
const HARDPOINT_POINTS = 10;
const ZONE_WAR_POINTS = 100;

const AUTO_CLOSE_EMPTY_MS = 60000;
const CHECK_EMPTY_INTERVAL_MS = 5000;

export const rooms: Room[] = [];

export class Room {
	name;
	io;
	game;
	password = "";
	isPermanent = false;
	hostSecret: string | null = null;
	private emptySince: number | null = Date.now();
	cosmetics = {
		hats,
		shirts,
		camos,
	};
	constructor(io: Server, name: string) {
		this.name = name;
		this.io = io.of(this.name);
		this.game = new Game(this.name);
		this.sortCosmetics();
		this.startCheckLootInterval();
		this.startCheckEmptyInterval();
	}

	configure(data: {
		srvPlayers?: number;
		srvHealthMult?: number;
		srvSpeedMult?: number;
		srvPass?: string;
		srvMap?: any;
		srvModes?: number[];
	}) {
		const players = Math.max(2, Math.min(8, Math.floor(data.srvPlayers ?? this.game.maxPlayers)));
		this.game.maxPlayers = players;
		this.game.mults.health = Math.max(0.01, Math.min(100, data.srvHealthMult ?? 1));
		this.game.mults.speed = Math.max(0.01, Math.min(100, data.srvSpeedMult ?? 1));
		this.password = data.srvPass ? data.srvPass : "";

		let modeIndex = 0;
		if (data.srvModes && data.srvModes.length > 0) {
			const modes = data.srvModes;
			this.game.modeVotes = gameModes
				.filter((m, i) => modes.includes(i))
				.map((m, i) => ({
					name: m.name,
					indx: i,
					votes: 0,
				}));
			modeIndex = modes[0];
		} else {
			this.game.modeVotes = gameModes.map((m, i) => ({
				name: m.name,
				indx: i,
				votes: 0,
			}));
		}

		this.game.newRound(modeIndex, data.srvMap ? data.srvMap : undefined);
	}

	close() {
		this.io.disconnectSockets(true);
		this.io.removeAllListeners();
		(this.io.server as any)._nsps.delete(this.name);
		const idx = rooms.indexOf(this);
		if (idx > -1) rooms.splice(idx, 1);
	}

	startCheckEmptyInterval() {
		setInterval(() => {
			if (this.isPermanent || this.game.players.length > 0) {
				this.emptySince = null;
				return;
			}
			if (this.emptySince == null) {
				this.emptySince = Date.now();
				return;
			}
			if (Date.now() - this.emptySince >= AUTO_CLOSE_EMPTY_MS) {
				this.close();
			}
		}, CHECK_EMPTY_INTERVAL_MS);
	}

	handleSocket() {
		this.io.on("connection", async (socket: Socket) => {
			this.emptySince = null;
			if (this.game.players.length >= this.game.maxPlayers) {
				socket.emit("kick", "Room is full.");
				socket.disconnect(true);
				return;
			}
			// room namespaces don't run the root-namespace middleware, so the
			// session cookie has to be validated here for logged-in players
			await attachSocketSession(socket as AuthenticatedSocket);
			emitAccountStats(socket as AuthenticatedSocket);
			let player = this.game.newPlayer();
			player.socketId = socket.id;
			console.log(`${player.name} joined ${player.room}`);

			socket.emit("yourRoom", `${this.name}`);
			socket.emit(
				"welcome",
				{
					id: player.id,
					room: player.room,
					name: player.name,
					classIndex: player.classIndex,
				},
				true,
			);
			socket.emit("updHt", hats.length, this.cosmetics.hats);
			socket.emit("updShrt", shirts.length, this.cosmetics.shirts);
			socket.emit(
				"updCmo",
				camos.length,
				this.game.weapons.map(() => this.cosmetics.camos),
			);

			socket.on("cHat", (id) => {
				if (isValidHatIndex(id)) {
					player.account.hat = hats[id - 1];
				}
			});
			socket.on("cShirt", (id) => {
				if (isValidShirtIndex(id)) {
					player.account.shirt = shirts[id - 1];
				}
			});
			socket.on("cCamo", (data) => {
				const wep = this.game.weapons[data.weaponID];
				if (wep) wep.camo = data.camoID - 1;
			});
			socket.on("cSpray", (id) => {
				const spray = sprays.find((s) => s.id === id);
				if (spray) {
					player.spray = {
						src: `/assets/sprays/${id}.png`,
						...spray,
					};
				}
			});

			socket.on("gotit", (client, init, currentTime) => {
				player.name = client.name ? sanitizeName(client.name) : player.name;
				if (isValidClassIndex(client.classIndex)) {
					player.classIndex = client.classIndex;
				}
				if (this.game.mode.code === "snipe") {
					player.classIndex = 2;
				} else if (this.game.mode.code === "rckt") {
					player.classIndex = 5;
				} else if (this.game.mode.code === "pyro") {
					player.classIndex = 7;
				} else if (this.game.mode.code === "boss" && player.team === "blue") {
					player.classIndex = 10;
					player.isBoss = true;
				}
				player.currentWeapon = 0;
				const currentClass = characterClasses[player.classIndex];
				player.weapons = currentClass.weaponIndexes.map(
					(i) => this.game.weapons[i],
				);
				player.health = player.maxHealth =
					currentClass.maxHealth * this.game.mults.health;
				player.height = currentClass.height;
				player.width = currentClass.width;
				player.speed = currentClass.speed * this.game.mults.speed;
				player.jumpStrength = currentClass.jumpStrength;
				player.gravityStrength = currentClass.gravityStrength;
				if (init) return;

				player.onScreen = true;
				player.angle = 0;
				const spawn = this.game.getSpawn(player);
				player.x = spawn.x;
				player.y = spawn.y;
				player.dead = false;
				player.isSpawnProtected = true;
				player.isInHardpoint = false;
				player.damageSources = {};
				setTimeout(() => {
					player.isSpawnProtected = false;
					this.io.emit("upd", { i: player.index, sp: false });
				}, SPAWN_PROTECTION_DURATION);

				const gameSetup = {
					mapData: this.game.mapData,

					maxScreenWidth: 1920,
					maxScreenHeight: 1080,
					viewMult: 1,
					tileScale: this.game.tileScale,

					usersInRoom: this.game.players,
					you: player,
				};

				socket.emit("gameSetup", JSON.stringify(gameSetup), true, true);

				if (player.firstReceive) {
					player.firstReceive = false;
					const gameModeDesc = player.isBoss
						? this.game.mode.desc2
						: this.game.mode.desc1;
					socket.emit("6", this.game.mode.name, gameModeDesc, 1.25);
				}
				this.io.emit("add", JSON.stringify(player));
				socket.emit(
					"rsd",
					this.game.players.flatMap((pl) => [
						5,
						pl.index,
						pl.x,
						pl.y,
						pl.angle,
					]),
				);
				if (this.game.roundEnd) {
					socket.emit("7", player.team, this.game.modeVotes, false);
				} else {
					this.updateScore(0, player);
				}
			});
			socket.on("respawn", () => {
				socket.emit(
					"welcome",
					{
						id: player.id,
						room: player.room,
						name: player.name,
						classIndex: player.classIndex,
					},
					false,
				);
			});
			socket.on("disconnect", () => {
				this.io.emit("rem", player.index);
				this.game.players.splice(this.game.players.indexOf(player), 1);
				if (this.game.players.length === 0) {
					this.emptySince = Date.now();
				}
				this.updateScore(0, player);
			});
			socket.on("sw", (currentWeapon) => {
				player.currentWeapon = clampNumber(currentWeapon, 0, player.weapons.length - 1);
				this.io.emit("upd", { i: player.index, wi: player.currentWeapon });
			});
			socket.on("r", () => {
				const currentWeapon = getCurrentWeapon(player);
				currentWeapon.spreadIndex = 0;
				const currentWeaponIndex = player.currentWeapon;
				setTimeout(() => {
					socket.emit("r", currentWeaponIndex);
				}, currentWeapon.reloadSpeed ?? 0);
			});
			socket.on("0", (targetF) => {
				player.targetF = targetF;
			});
			socket.on("1", (x, y, jumpY, targetF, targetD, currentTime) => {
				const currentWeapon = getCurrentWeapon(player);
				if (!currentWeapon) return;
				if (!isWithinShootDistance(x, y, player.x, player.y)) {
					x = player.x;
					y = player.y;
				}
				for (let i = 0; i < currentWeapon.bulletsPerShot; i++) {
					currentWeapon.spreadIndex++;
					if (currentWeapon.spreadIndex >= currentWeapon.spread.length) {
						currentWeapon.spreadIndex = 0;
					}
					const spread = currentWeapon.spread[currentWeapon.spreadIndex];
					const dir = roundNumber(targetF + Math.PI + spread, 2);
					const origin = currentWeapon.holdDist + currentWeapon.bDist;
					const newX = Math.round(x + origin * Math.cos(dir));
					const newY = Math.round(
						y - currentWeapon.yOffset - jumpY + origin * Math.sin(dir),
					);
					const bullet = getNextBullet(this.game.bullets);
					const bulletData = {
						i: player.index,
						x: newX,
						y: newY,
						d: dir,
						si: bullet.serverIndex,
					};
					this.io.emit("2", bulletData);
					shootNextBullet(bulletData, player, targetD, currentTime, bullet);
					this.updateBullet(bullet, player, dir);
				}
			});
			socket.on("4", (data) => {
				const inputNumber = data.isn;

				if (!player.dead) {
					const clamped = clampMovementInput(data);
					let horizontalDT = clamped.hdt;
					let verticalDT = clamped.vdt;
					const space = clamped.s;
					player.delta = clamped.delta;
					const delta = clamped.delta;
					const lengthDT = Math.sqrt(
						horizontalDT * horizontalDT + verticalDT * verticalDT,
					);
					if (lengthDT !== 0) {
						horizontalDT /= lengthDT;
						verticalDT /= lengthDT;
					}
					player.oldX = player.x;
					player.oldY = player.y;
					player.x += horizontalDT * player.speed * delta;
					player.y += verticalDT * player.speed * delta;
					player.angle =
						((player.targetF + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI) +
						90;

					//TODO
					if (space === 1) {
						this.io.emit("jum", player.index);
						if (player.jumpY <= 0) {
							player.jumpDelta = player.jumpStrength;
							player.jumpY = player.jumpDelta;
						}
					}
					if (player.jumpCountdown > 0) {
						player.jumpCountdown -= delta;
					}
					if (player.jumpY > 0) {
						player.jumpDelta -= player.gravityStrength * delta;
						player.jumpY += player.jumpDelta * delta;
						if (player.jumpY <= 0) {
							player.jumpY = 0;
							player.jumpDelta = 0;
							player.jumpCountdown = 250;
							if (player.classIndex === 8) {
								const dir = roundNumber(player.targetF + Math.PI, 2);
								this.doExplosion(
									player,
									player.x,
									player.y,
									DUCK_HIT_RADIUS,
									DUCK_HIT_DAMAGE,
									dir,
									false,
								);
								this.handleHit(player, player, -100, dir);
							}
						}
						player.jumpY = Math.round(player.jumpY);
					}
					wallCol(player, this.game.tiles, this.game.clutter);
					this.checkSpecialTiles(player);
					player.x = Math.round(player.x);
					player.y = Math.round(player.y);
				}

				socket.emit(
					"rsd",
					this.game.players.flatMap((pl) => [
						6,
						pl.index,
						pl.x,
						pl.y,
						pl.angle,
						pl.index === player.index ? inputNumber : pl.nameYOffset,
					]),
				);
			});
			socket.on("cht", (msg, type) => {
				if (!chatRateLimiter(socket.id)) return;
				msg = sanitizeChatMessage(msg);
				if (msg.includes("!sync")) {
					this.io.emit(
						"rsd",
						this.game.players.flatMap((pl) => [
							5,
							pl.index,
							pl.x,
							pl.y,
							pl.angle,
						]),
					);
					socket.emit("cht", [-1, "synced"]);
					return;
				}
				if (type === "TEAM" && this.game.mode.teams) {
					for (let pl of this.game.players) {
						if (pl.team === player.team && pl.socketId) {
							this.io
								.to(pl.socketId)
								.emit("cht", [player.index, `(TEAM) ${msg}`]);
						}
					}
				} else {
					this.io.emit("cht", [player.index, msg]);
				}
			});
			socket.on("modeVote", (i) => {
				if (!isValidModeVoteIndex(i, this.game.modeVotes)) return;
				let vote = this.game.modeVotes[i];
				if (player.lastModeVote !== undefined) {
					let lastVote = this.game.modeVotes[player.lastModeVote];
					lastVote.votes -= 1;
					this.io.emit("vt", {
						i: player.lastModeVote,
						n: lastVote.name,
						v: lastVote.votes,
					});
				}
				player.lastModeVote = i;

				vote.votes += 1;
				this.io.emit("vt", {
					i: i,
					n: vote.name,
					v: vote.votes,
				});
			});
			socket.on("like", (sourceIndex: number, destIndex: number) => {
				if (sourceIndex !== player.index) return;
				const likedPlayer = this.game.players.find(
					(pl) => pl.index === destIndex,
				);
				if (likedPlayer) {
					const likedByIndex = likedPlayer.likedBy.indexOf(sourceIndex);
					if (likedByIndex > -1) {
						likedPlayer.likedBy.splice(likedByIndex, 1);
					} else {
						likedPlayer.likedBy.push(sourceIndex);
					}
					this.io.emit("upd", { i: destIndex, l: likedPlayer.likedBy });
				}
			});
			socket.on("ping1", () => {
				socket.emit("pong1");
			});
			socket.on("cSrv", (data) => {
				if (this.hostSecret && data.hostSecret !== this.hostSecret) return;
				this.configure(data);
				socket.emit("cSrvRes", this.name, true);
			});
			socket.on("closeRoom", (secret: string) => {
				if (secret && secret === this.hostSecret) {
					this.close();
				}
			});
			socket.on("crtSpr", () => {
				let weaponYOffset = 55;
				let muzzleDistance = 50;

				const currentWeapon = getCurrentWeapon(player);
				if (currentWeapon) {
					weaponYOffset = currentWeapon.yOffset;
					muzzleDistance = currentWeapon.holdDist + currentWeapon.bDist;
				}

				const muzzleAngle = player.targetF + Math.PI;
				const muzzleEndX = Math.round(
					player.x + muzzleDistance * Math.cos(muzzleAngle),
				);
				const muzzleEndY = Math.round(
					player.y -
						player.jumpY -
						weaponYOffset / 2 +
						muzzleDistance * Math.sin(muzzleAngle),
				);
				this.io.emit("crtSpr", player.index, muzzleEndX, muzzleEndY);
			});
			socket.on("create", (lobby) => {});
		});
	}

	updateScore(scored: number, source: Player) {
		source.score += scored;
		if (source.isInHardpoint) {
			source.hardpointScore += scored;
			if (source.socketId) {
				this.io.to(source.socketId).emit("5", `+${source.hardpointScore}`);
			}
		}
		this.io.emit(
			"lb",
			this.game.players
				.filter((p) => !p.firstReceive)
				.toSorted((a, b) => b.score - a.score)
				.flatMap((pl) => [pl.index]),
		);
		let lbScore = scored / (this.game.mode.score / 100);
		if (source.team === "red") {
			lbScore = this.game.score.red += lbScore;
			this.io.emit("ts", this.game.score.red, this.game.score.blue);
		} else if (source.team === "blue") {
			lbScore = this.game.score.blue += lbScore;
			this.io.emit("ts", this.game.score.red, this.game.score.blue);
		} else {
			lbScore = source.score / (this.game.mode.score / 100);
			this.io.emit("ts");
		}
		const leading = Math.max(lbScore, this.game.score.lb);
		this.game.score.lb = roundNumber(leading, 0);
		if (lbScore + 1e-7 >= 100 && !this.game.roundEnd) {
			this.game.roundEnd = true;
			this.io.emit("7", source.team, this.game.modeVotes, false);
			let timeLeft = 15;
			let timer = setInterval(() => {
				if (timeLeft >= 0) {
					this.io.emit("8", timeLeft--);
				} else {
					let sorted = this.game.modeVotes.toSorted(
						(a, b) => b.votes - a.votes,
					);
					for (const pl of this.game.players) {
						// this.io is a Namespace: `.sockets` is already the id->socket Map
						const authSocket = pl.socketId
							? this.io.sockets.get(pl.socketId)
							: null;
						const userId = (authSocket as AuthenticatedSocket | null | undefined)?.userId;
						if (userId) {
							saveRoundStats(userId, {
								kills: pl.kills,
								deaths: pl.deaths,
								score: pl.score,
								damage: Math.abs(pl.totalDamage),
								healing: pl.totalHealing,
								goals: pl.totalGoals,
							});
						}
					}
					this.game.newRound(sorted[0].indx);
					for (const pl of this.game.players) {
						// only to the owning socket: broadcasting made every client
						// adopt the last player's identity after each round
						if (!pl.socketId) continue;
						this.io.to(pl.socketId).emit(
							"welcome",
							{
								id: pl.id,
								room: pl.room,
								name: pl.name,
								classIndex: pl.classIndex,
							},
							true,
						);
					}
					clearInterval(timer);
				}
			}, 1000);
		}
	}

	updateBullet(bullet: Projectile, player: Player, dir: number) {
		const tick = () => {
			if (
				!bullet.active &&
				(bullet.explodeOnDeath || bullet.collidesWithExplosiveClutter)
			) {
				if (bullet.explodeOnDeath && bullet.blastRadius) {
					this.doExplosion(
						player,
						bullet.x,
						bullet.y,
						bullet.blastRadius,
						bullet.dmg,
						dir,
						bullet.selfDamage,
						bullet,
					);
				}
				if (
					bullet.collidesWithExplosiveClutter &&
					bullet.hitClutter.length > 0
				) {
					const i = bullet.hitClutter[0];
					const clt = this.game.clutter[i];
					if (clt.active) {
						this.doExplosion(
							player,
							clt.x + clt.w / 2,
							clt.y - clt.h / 2,
							EXPLOSIVE_CLUTTER_BLAST_RADIUS,
							EXPLOSIVE_CLUTTER_HIT_DAMAGE,
							dir,
							true,
						);
						clt.active = false;
						this.io.emit("4", clt, i, 1);
					}
				}
			} else if (bullet.hitPlayers.length > 0) {
				for (const i of bullet.hitPlayers) {
					const hitPlayer = this.game.players.find(
						(pl) => pl.index === Number(i),
					);
					if (hitPlayer) {
						this.handleHit(player, hitPlayer, -bullet.dmg, dir, bullet);
					}
				}
			}
			if (bullet.active) {
				bullet.update(
					player.delta,
					Date.now(),
					this.game.clutter,
					this.game.tiles,
					this.game.players,
				);
				setTimeout(tick, player.delta);
				return;
			}
			bullet.deactivate();
		};
		tick();
	}

	handleHit(
		source: Player,
		dest: Player,
		dmg: number,
		dir: number,
		bullet?: Projectile,
	) {
		if (dest?.dead) return;

		const cappedDmg = Math.max(-dest.health, dmg);
		dest.health += cappedDmg;
		this.io.emit("1", {
			dID: source.index,
			gID: dest.index,
			dir: dir,
			healthDelta: cappedDmg,
			bulletIndex: bullet?.serverIndex ?? null,
			health: dest.health,
		});

		source.totalDamage -= cappedDmg;
		dest.damageSources[source.index] =
			(dest.damageSources[source.index] ?? 0) - cappedDmg;
		this.io.emit("upd", {
			i: source.index,
			dmg: source.totalDamage,
		});

		if (dest.health <= 0) {
			this.handleKill(source, dest);
		}
	}

	handleAssist(source: Player, dest: Player, assistDamage: number) {
		const maxHealthMinusSelfDamage =
			dest.maxHealth - (dest.damageSources[dest.index] ?? 0);
		const scored =
			Math.round((100 * assistDamage) / maxHealthMinusSelfDamage) *
			this.game.mode.killScoreMult;
		this.io.emit("3", {
			dID: source.index,
			gID: dest.index,
			sS: scored,
			kB: false,
			ast: true,
		});

		this.updateScore(scored, source);
		this.io.emit("upd", {
			i: source.index,
			s: source.score,
		});
	}

	updateKillStreak(player: Player) {
		const updatedKillStreak = ++player.killStreak;
		setTimeout(() => {
			if (player.killStreak === updatedKillStreak) {
				player.killStreak = 0;
			}
		}, 2500);
	}

	handleKill(source: Player, dest: Player) {
		dest.dead = true;
		dest.onScreen = false;
		dest.deaths++;
		this.io.emit("upd", {
			i: dest.index,
			dea: dest.deaths,
		});

		const isSuicide = source.index === dest.index;
		let scored = 0;

		if (!isSuicide) {
			source.kills++;
			this.updateKillStreak(source);
		}

		if (dest.isBoss && !isSuicide) {
			scored = 2000;
		} else if (!dest.isBoss) {
			let totalAssistDamage = 0;
			for (const [assistSrc, assistDmg] of Object.entries(dest.damageSources)) {
				const assistPlayer = this.game.players.find(
					(pl) => pl.index === Number(assistSrc),
				);
				if (
					assistPlayer &&
					assistDmg > 0 &&
					assistPlayer.index !== source.index &&
					assistPlayer.index !== dest.index
				) {
					totalAssistDamage += assistDmg;
					this.handleAssist(assistPlayer, dest, assistDmg);
				}
			}
			const maxHealthMinusSelfDamage =
				dest.maxHealth - (dest.damageSources[dest.index] ?? 0);
			if (maxHealthMinusSelfDamage > 0) {
				scored =
					Math.round(
						(100 * (maxHealthMinusSelfDamage - totalAssistDamage)) /
							maxHealthMinusSelfDamage,
					) * this.game.mode.killScoreMult;
			}
		}

		for (const pl of this.game.players) {
			pl.damageSources[dest.index] = 0;
		}

		const killMessage = isSuicide
			? `${source.name} committed suicide`
			: `${source.name} killed ${dest.name}`;
		this.io.emit("5", killMessage);
		this.io.emit("3", {
			dID: source.index,
			gID: dest.index,
			sS: scored,
			kB: dest.isBoss,
			kd: source.killStreak,
		});

		this.updateScore(scored, source);
		this.io.emit("upd", {
			i: source.index,
			s: source.score,
			kil: source.kills,
		});
	}

	/**
	 * Creates an explosion at (x, y) and applies splash damage in a circle with specified radius.
	 * Explosions coming up from the bottom are most effective, followed by those coming from the sides.
	 */
	doExplosion(
		source: Player,
		x: number,
		y: number,
		radius: number,
		maxDmg: number,
		dir: number,
		selfDamage: boolean,
		bullet?: Projectile,
	) {
		this.io.emit("ex", x, y, Math.round(radius / 50));
		for (const pl of this.game.players) {
			if (
				(!selfDamage && pl.index === source.index) ||
				(this.game.mode.teams &&
					pl.index !== source.index &&
					pl.team === source.team)
			)
				continue;
			const dist = getDistance(x, y, pl.x, pl.y - pl.jumpY);
			if (radius > dist) {
				const dmg = Math.round(
					-maxDmg * Math.min(1, (1.05 * (radius - dist)) / radius),
				);
				this.handleHit(source, pl, dmg, dir, bullet);
			}
		}
	}

	checkSpecialTiles(player: Player) {
		for (const [i, pkup] of this.game.pickups.entries()) {
			if (
				!pkup.active ||
				!dotInRect(
					player.x,
					player.y,
					pkup.x - pkup.scale / 2,
					pkup.y - pkup.scale / 2,
					pkup.scale,
					pkup.scale,
				)
			)
				continue;

			if (
				pkup.type === "healthpack" &&
				player.health < player.maxHealth &&
				!player.isBoss
			) {
				const healing = Math.min(100, player.maxHealth - player.health);

				player.totalHealing += healing;
				player.damageSources = {};
				this.io.emit("upd", {
					i: player.index,
					hea: player.totalHealing,
				});

				player.health += healing;
				this.io.emit("1", {
					gID: player.index,
					healthDelta: healing,
					health: player.health,
				});

				setTimeout(() => {
					pkup.active = true;
					this.io.emit("4", pkup, i, 0);
				}, 15000);
			} else if (pkup.type === "lootcrate" && this.game.mode.code === "lc") {
				this.updateScore(LOOTCRATE_POINTS, player);
				this.io.emit("upd", {
					i: player.index,
					s: player.score,
				});

				if (player.socketId) {
					this.io
						.to(player.socketId)
						.emit("6", "Loot Collected", `+${LOOTCRATE_POINTS} points`, 1.25);
				}
			} else {
				return;
			}

			pkup.active = false;
			this.io.emit("4", pkup, i, 0);
		}

		if (this.game.mode.code === "hp") {
			if (player.scoreCountdown > 0) {
				player.scoreCountdown -= player.delta;
			} else {
				player.isInHardpoint = false;

				for (const tl of this.game.scoreTiles) {
					if (
						!dotInRect(player.x, player.y, tl.x, tl.y, tl.scale, tl.scale) ||
						tl.objTeam === player.team
					)
						continue;

					player.scoreCountdown = 1000;
					player.isInHardpoint = true;
					this.updateScore(HARDPOINT_POINTS, player);
					this.io.emit("upd", {
						i: player.index,
						s: player.score,
						goa: player.totalGoals,
					});
				}

				if (!player.isInHardpoint) {
					player.hardpointScore = 0;
				}
			}
		}
		if (this.game.mode.code === "zmtch") {
			for (const tl of this.game.scoreTiles) {
				if (
					!dotInRect(player.x, player.y, tl.x, tl.y, tl.scale, tl.scale) ||
					tl.objTeam === player.team
				)
					continue;

				const tprt: ZoneEvent = { indx: player.index, score: ZONE_WAR_POINTS };
				const spawn = this.game.getSpawn(player);
				player.x = tprt.newX = spawn.x;
				player.y = tprt.newY = spawn.y;
				player.totalGoals += 1;
				this.io.emit("tprt", tprt);

				this.updateScore(ZONE_WAR_POINTS, player);
				this.io.emit("upd", {
					i: player.index,
					s: player.score,
					goa: player.totalGoals,
				});
			}
		}
	}

	sortCosmetics() {
		this.cosmetics.hats = hats
			.filter((h) => !h.hide)
			.map((h) => ({
				id: h.id,
				name: h.name,
				desc: h.desc,
				chance: h.chance,
				count: 0,
				creator: h.creator,
				left: h.left,
				up: h.up,
				nameY: h.nameY,
			}))
			.toSorted((a, b) => a.chance - b.chance);

		this.cosmetics.shirts = shirts
			.filter((h) => !h.hide)
			.map((s) => ({
				id: s.id,
				name: s.name,
				desc: s.desc,
				chance: s.chance,
				count: 0,
				left: s.left,
				up: s.up,
			}))
			.toSorted((a, b) => a.chance - b.chance);

		this.cosmetics.camos = camos
			.filter((h) => !h.hide)
			.map((p) => ({
				id: p.id,
				name: p.name,
				chance: p.chance,
				count: 0,
			}))
			.toSorted((a, b) => a.chance - b.chance);
	}

	startCheckLootInterval() {
		setInterval(() => {
			if (this.game.roundEnd || this.game.mode.code !== "lc") {
				return;
			}

			const loot = this.game.pickups.filter((p) => p.type === "lootcrate");
			const [inactiveLoot, activeLoot] = loot.reduce(
				(acc, cur) => {
					acc[cur.active ? 1 : 0].push(cur);
					return acc;
				},
				[[] as PickupObject[], [] as PickupObject[]],
			);
			if (activeLoot.length >= MAX_ACTIVE_LOOT || inactiveLoot.length === 0) {
				return;
			}

			const lootToActivate =
				inactiveLoot[Math.floor(Math.random() * inactiveLoot.length)];
			const i = this.game.pickups.indexOf(lootToActivate);
			lootToActivate.active = true;
			this.io.emit("4", lootToActivate, i, 0);
		}, 5000);
	}
}
