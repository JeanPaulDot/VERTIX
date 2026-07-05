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
	randomInt,
	roundNumber,
	shootNextBullet,
	wallCol,
} from "core/src/utils.ts";
import {
	BOT_CLASS_POOL,
	BOT_PREFERRED_RANGE,
	type BotState,
	createBotState,
	randomBotDifficulty,
	randomBotName,
} from "./bots.ts";
import { Game } from "./game.ts";
import {
	sanitizeName,
	isValidClassIndex,
	clampNumber,
	isValidHatIndex,
	isValidShirtIndex,
	isValidCamoIndex,
	isValidModeVoteIndex,
	isWithinShootDistance,
	sanitizeChatMessage,
	clampMovementInput,
	createRateLimiter,
	createIntervalLimiter,
	isValidGenData,
} from "./security.ts";
import {
	saveRoundStats,
	incrementLikes,
	decrementLikes,
	findUserClanMembership,
	getUserStats,
	hasUnlock,
	grantCrate,
} from "./db.ts";
import { checkForNewUnlocks } from "./unlocks.ts";
import { incrementQuestProgressFromStats, getQuestProgressSnapshot } from "./quests.ts";
import {
	attachSocketSession,
	buildAccountPayload,
	emitAccountStats,
	emitUnlocks,
	setupAuthHandlers,
	type AuthenticatedSocket,
} from "./auth.ts";

const chatRateLimiter = createRateLimiter(5, 1000);
// generous min-interval throttles for per-frame input: these only guard
// against pathological flooding, not legitimate high refresh-rate clients
// (angle/movement are emitted once per rendered frame; the fastest weapon
// fires every 78ms, so 50ms leaves headroom without throttling real fire)
const angleRateLimiter = createIntervalLimiter(4);
const movementRateLimiter = createIntervalLimiter(4);
const shootRateLimiter = createIntervalLimiter(50);

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

const BOT_TICK_MS = 100;
const BOT_RESPAWN_MS = 2500;
const BOT_MAX_FIRE_RANGE = 900;
const MAX_BOTS_PER_ROOM = 4;
// bots' bullets step at this delta (real clients send ~16ms frame deltas);
// using the 100ms brain tick here would make projectiles tunnel through walls
const BOT_PROJECTILE_STEP_MS = 16;

export const rooms: Room[] = [];

export class Room {
	name;
	io;
	game;
	password = "";
	isPermanent = false;
	hostSecret: string | null = null;
	private emptySince: number | null = Date.now();
	private bots = new Map<Player, BotState>();
	private botInterval: ReturnType<typeof setInterval> | null = null;
	cosmetics = {
		hats,
		shirts,
		camos,
	};
	// in-memory per-user round stats for real-time quest progress tracking
	roundQuestStats = new Map<number, { kills: number; deaths: number; damage: number; healing: number; goals: number; score: number; won: boolean }>();
	constructor(io: Server, name: string) {
		this.name = name;
		this.io = io.of(this.name);
		this.game = new Game(this.name);
		this.sortCosmetics();
		this.startCheckLootInterval();
		this.startCheckEmptyInterval();
		this.botInterval = setInterval(() => this.tickBots(), BOT_TICK_MS);
	}

	/** Returns false if a custom map was supplied but rejected (falls back to the default map). */
	configure(data: {
		srvPlayers?: number;
		srvHealthMult?: number;
		srvSpeedMult?: number;
		srvPass?: string;
		srvMap?: any;
		srvModes?: number[];
	}): boolean {
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

		const mapRejected = !!data.srvMap && !isValidGenData(data.srvMap);
		const customMap = data.srvMap && !mapRejected ? data.srvMap : undefined;
		this.game.newRound(modeIndex, customMap);
		return !mapRejected;
	}

	close() {
		if (this.botInterval) {
			clearInterval(this.botInterval);
			this.botInterval = null;
		}
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
				// bots yield their slot to joining humans: evict the weakest first
				const evictable = [...this.bots.keys()].sort(
					(a, b) =>
						(this.bots.get(a)?.difficulty.tier ?? 0) - (this.bots.get(b)?.difficulty.tier ?? 0),
				);
				if (evictable.length > 0) {
					this.removeBot(evictable[0]);
				} else {
					socket.emit("kick", "Room is full.");
					socket.disconnect(true);
					return;
				}
			}
			if (this.password && socket.handshake.auth?.password !== this.password) {
				socket.emit("kick", "Incorrect password.");
				socket.disconnect(true);
				return;
			}
			// room namespaces don't run the root-namespace middleware/handlers, so
			// the session cookie and login/clan handlers have to be set up here too
			// — this is the only namespace the game client ever actually connects to
			const authSocket = socket as AuthenticatedSocket;
			await attachSocketSession(authSocket);
			setupAuthHandlers(authSocket);
			emitAccountStats(authSocket);
			let player = this.game.newPlayer();
			player.socketId = socket.id;
			let hasLoggedJoin = false;
			if (authSocket.userId) {
				const membership = findUserClanMembership(authSocket.userId);
				if (membership) player.account.clan = membership.name;
			}
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
			emitUnlocks(authSocket);

			socket.on("cHat", (id) => {
				// guests have no account to persist unlocks against, so they keep
				// today's free-selection behavior; logged-in players must own the item
				if (isValidHatIndex(id) && (!authSocket.userId || hasUnlock(authSocket.userId, "hat", id))) {
					player.account.hat = hats[id - 1];
				}
			});
			socket.on("cShirt", (id) => {
				if (isValidShirtIndex(id) && (!authSocket.userId || hasUnlock(authSocket.userId, "shirt", id))) {
					player.account.shirt = shirts[id - 1];
				}
			});
			socket.on("cCamo", (data) => {
				const wep = this.game.weapons[data.weaponID];
				if (!wep || !isValidCamoIndex(data.camoID)) return;
				// camoID 0 means "no camo" (client default) — always allowed, no ownership needed
				if (
					data.camoID === 0 ||
					!authSocket.userId ||
					hasUnlock(authSocket.userId, "camo", data.camoID)
				) {
					wep.camo = data.camoID - 1;
				}
			});
			socket.on("cSpray", (id) => {
				const spray = sprays.find((s) => s.id === id);
				if (spray) {
					player.spray = {
						src: `/images/sprays/${id}.png`,
						...spray,
					};
				}
			});

			socket.on("gotit", (client, init, currentTime) => {
				player.name = client.name ? sanitizeName(client.name) : player.name;
				if (isValidClassIndex(client.classIndex)) {
					player.classIndex = client.classIndex;
				}
				this.applyClassLoadout(player);
				if (init) return;

				// the non-init "gotit" path also runs on every respawn — only log the first spawn
				if (!hasLoggedJoin) {
					hasLoggedJoin = true;
					console.log(
						`[join] ${player.name} joined ${this.name}${authSocket.userId ? "" : " (guest)"}`,
					);
				}

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
				if (!angleRateLimiter(socket.id)) return;
				this.applyAngleInput(player, targetF);
			});
			socket.on("1", (x, y, jumpY, targetF, targetD, currentTime) => {
				if (!shootRateLimiter(socket.id)) return;
				this.applyShootInput(player, x, y, jumpY, targetF, targetD, currentTime);
			});
			socket.on("4", (data) => {
				if (!movementRateLimiter(socket.id)) return;
				this.applyMovementInput(player, data, socket);
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
				console.log(
					`[chat] [${this.name}]${type === "TEAM" ? " (team)" : ""} ${player.name}: ${msg}`,
				);
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
					const destSocket = likedPlayer.socketId
						? this.io.sockets.get(likedPlayer.socketId)
						: null;
					const destUserId = (destSocket as AuthenticatedSocket | null | undefined)?.userId;
					if (likedByIndex > -1) {
						likedPlayer.likedBy.splice(likedByIndex, 1);
						if (destUserId) decrementLikes(destUserId);
					} else {
						likedPlayer.likedBy.push(sourceIndex);
						if (destUserId) incrementLikes(destUserId);
					}
					this.io.emit("upd", { i: destIndex, l: likedPlayer.likedBy });
				}
			});
			socket.on("ping1", () => {
				socket.emit("pong1");
			});
			socket.on("cSrv", (data) => {
				if (data.hostSecret !== this.hostSecret) return;
				const mapAccepted = this.configure(data);
				const message = mapAccepted
					? this.name
					: `${this.name} (invalid map, using default)`;
				socket.emit("cSrvRes", message, true);
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

	// --- input handling, shared between real sockets and bots ---
	// (bodies moved verbatim from the socket.on("0"/"1"/"4") closures so bots
	// run the exact same movement/physics/shooting code as real players)

	private applyAngleInput(player: Player, targetF: number) {
		player.targetF = targetF;
	}

	private applyShootInput(
		player: Player,
		x: number,
		y: number,
		jumpY: number,
		targetF: number,
		targetD: number,
		currentTime: number,
	) {
		const currentWeapon = getCurrentWeapon(player);
		if (!currentWeapon) return;
		// anti-cheat position check; trivially passes for bots since their
		// "claimed" position is whatever the brain just moved them to.
		// reject the shot outright rather than silently reusing the server
		// position, so a spoofed position can't still land a shot.
		if (!isWithinShootDistance(x, y, player.x, player.y)) {
			console.warn(
				`[anti-cheat] rejected shot from player ${player.index} (${player.name}): claimed (${x}, ${y}) vs server (${player.x}, ${player.y})`,
			);
			return;
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
	}

	private applyMovementInput(
		player: Player,
		data: { hdt: unknown; vdt: unknown; delta: unknown; s: unknown; isn: unknown },
		socket?: Socket,
	) {
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

		// position echo: clients receive everyone's positions in response to
		// their own movement packets; bots have no socket and don't need it
		socket?.emit(
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
	}

	/** Applies gamemode class overrides + class stats/weapons (shared by "gotit" and bot spawns). */
	private applyClassLoadout(player: Player) {
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
	}

	// --- AI bots ---

	private humanCount() {
		return this.game.players.filter((p) => !p.isBot).length;
	}

	private spawnBot() {
		const bot = this.game.newPlayer();
		bot.isBot = true;
		bot.name = randomBotName();
		bot.classIndex = BOT_CLASS_POOL[randomInt(0, BOT_CLASS_POOL.length - 1)];
		// cosmetic flavor so bots don't all look identical
		const visibleHats = hats.filter((h) => !h.hide);
		const visibleShirts = shirts.filter((s) => !s.hide);
		if (Math.random() < 0.5 && visibleHats.length > 0) {
			bot.account.hat = visibleHats[randomInt(0, visibleHats.length - 1)];
		}
		if (Math.random() < 0.5 && visibleShirts.length > 0) {
			bot.account.shirt = visibleShirts[randomInt(0, visibleShirts.length - 1)];
		}
		const difficulty = randomBotDifficulty();
		this.bots.set(bot, createBotState(difficulty));
		this.spawnBotPlayer(bot);
		console.log(`[bot] ${bot.name} (${difficulty.name}) joined ${this.name}`);
	}

	/** (Re)spawns a bot into the current round — mirror of the non-init "gotit" path. */
	private spawnBotPlayer(bot: Player) {
		this.applyClassLoadout(bot);
		bot.onScreen = true;
		bot.angle = 0;
		const spawn = this.game.getSpawn(bot);
		bot.x = spawn.x;
		bot.y = spawn.y;
		bot.dead = false;
		bot.isSpawnProtected = true;
		bot.isInHardpoint = false;
		bot.damageSources = {};
		bot.firstReceive = false;
		setTimeout(() => {
			bot.isSpawnProtected = false;
			this.io.emit("upd", { i: bot.index, sp: false });
		}, SPAWN_PROTECTION_DURATION);
		this.io.emit("add", JSON.stringify(bot));
		this.updateScore(0, bot);
	}

	private removeBot(bot: Player) {
		this.bots.delete(bot);
		const idx = this.game.players.indexOf(bot);
		if (idx > -1) this.game.players.splice(idx, 1);
		this.io.emit("rem", bot.index);
	}

	private tickBots() {
		const now = Date.now();
		if (this.humanCount() === 0) {
			// bots never keep a room alive on their own
			if (this.bots.size > 0) {
				for (const bot of [...this.bots.keys()]) this.removeBot(bot);
			}
			return;
		}
		// top up one bot per tick, always leaving the last slot free for humans, capped at MAX_BOTS_PER_ROOM
		if (
			!this.game.roundEnd &&
			this.bots.size < MAX_BOTS_PER_ROOM &&
			this.game.players.length < this.game.maxPlayers - 1
		) {
			this.spawnBot();
		}
		for (const [bot, state] of this.bots) {
			if (this.game.roundEnd) continue;
			if (bot.dead) {
				if (state.respawnAt === 0) {
					state.respawnAt = now + BOT_RESPAWN_MS;
				} else if (now >= state.respawnAt) {
					state.respawnAt = 0;
					this.spawnBotPlayer(bot);
				}
				continue;
			}
			this.tickBotAI(bot, state, now);
		}
	}

	private tickBotAI(bot: Player, state: BotState, now: number) {
		const enemies = this.game.players.filter(
			(p) =>
				p !== bot &&
				!p.dead &&
				p.onScreen &&
				(!this.game.mode.teams || p.team !== bot.team),
		);

		// target acquisition with hysteresis (don't flicker between targets)
		let target = state.targetIndex != null
			? enemies.find((p) => p.index === state.targetIndex)
			: undefined;
		let nearest: Player | undefined;
		let nearestDist = Infinity;
		for (const e of enemies) {
			const d = getDistance(bot.x, bot.y, e.x, e.y);
			if (d < nearestDist) {
				nearestDist = d;
				nearest = e;
			}
		}
		if (!target) {
			target = nearest;
			if (target) {
				state.targetIndex = target.index;
				state.targetAcquiredAt = now;
			}
		} else if (nearest && nearest !== target) {
			const currentDist = getDistance(bot.x, bot.y, target.x, target.y);
			if (nearestDist < currentDist * 0.8) {
				target = nearest;
				state.targetIndex = target.index;
				state.targetAcquiredAt = now;
			}
		}
		if (!target) {
			state.targetIndex = null;
			return;
		}

		const dist = getDistance(bot.x, bot.y, target.x, target.y);

		// aim toward target with skill-based jitter (same angle convention as
		// the client: targetF points from the target back to the shooter)
		const jitter = (Math.random() * 2 - 1) * state.difficulty.aimError;
		const aimF = Math.atan2(bot.y - target.y, bot.x - target.x) + jitter;
		this.applyAngleInput(bot, aimF);

		// movement: close in / back off around the class's preferred range,
		// strafe perpendicular when in the sweet spot
		const preferred = BOT_PREFERRED_RANGE[bot.classIndex] ?? 350;
		const dx = (target.x - bot.x) / (dist || 1);
		const dy = (target.y - bot.y) / (dist || 1);
		let hdt: number;
		let vdt: number;
		if (dist > preferred * 1.2) {
			hdt = dx;
			vdt = dy;
		} else if (dist < preferred * 0.5) {
			hdt = -dx;
			vdt = -dy;
		} else {
			hdt = -dy * state.strafeDir;
			vdt = dx * state.strafeDir;
		}
		if (Math.random() < state.difficulty.strafeChance * 0.15) {
			state.strafeDir = state.strafeDir === 1 ? -1 : 1;
		}

		// crude anti-stuck: if we've barely moved while trying to, burst-strafe
		const moved = getDistance(bot.x, bot.y, state.lastX, state.lastY);
		if (moved < 4) {
			if (state.stuckSince === 0) {
				state.stuckSince = now;
			} else if (now - state.stuckSince > 500) {
				state.strafeUntil = now + 450;
				state.strafeDir = state.strafeDir === 1 ? -1 : 1;
				state.stuckSince = 0;
			}
		} else {
			state.stuckSince = 0;
		}
		if (now < state.strafeUntil) {
			hdt = -dy * state.strafeDir;
			vdt = dx * state.strafeDir;
		}
		state.lastX = bot.x;
		state.lastY = bot.y;

		const jump = Math.random() < state.difficulty.strafeChance * 0.06 ? 1 : 0;
		this.applyMovementInput(bot, {
			hdt,
			vdt,
			s: jump,
			isn: 0,
			delta: BOT_TICK_MS,
		});
		// after movement, force a fine projectile step for this bot's bullets
		bot.delta = BOT_PROJECTILE_STEP_MS;

		// fire control
		const weapon = getCurrentWeapon(bot);
		if (!weapon) return;
		if (now < state.reloadUntil) return;
		if (now - state.targetAcquiredAt < state.difficulty.reactionDelayMs) return;
		if (dist > BOT_MAX_FIRE_RANGE) return;
		const effectiveRate = Math.max(weapon.fireRate, 200) / state.difficulty.fireDiscipline;
		if (now - state.lastShotAt < effectiveRate) return;
		state.lastShotAt = now;
		this.applyShootInput(bot, bot.x, bot.y, bot.jumpY, aimF, dist, now);
		state.shotsSinceReload++;
		// simulated reload pause so bots don't fire forever (server doesn't
		// track ammo — real clients enforce it locally via the "r" event)
		if (state.shotsSinceReload >= Math.max(1, weapon.maxAmmo)) {
			state.shotsSinceReload = 0;
			state.reloadUntil = now + (weapon.reloadSpeed ?? 800);
		}
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
							const previousScore = getUserStats(userId)?.score ?? 0;
							saveRoundStats(userId, {
								kills: pl.kills,
								deaths: pl.deaths,
								score: pl.score,
								damage: Math.abs(pl.totalDamage),
								healing: pl.totalHealing,
								goals: pl.totalGoals,
							});

							const isTeamMode = this.game.mode.teams;
							const won = isTeamMode
								? pl.team === source.team
								: pl.index === source.index;
							incrementQuestProgressFromStats(userId, {
								kills: pl.kills,
								deaths: pl.deaths,
								score: pl.score,
								damage: Math.abs(pl.totalDamage),
								healing: pl.totalHealing,
								goals: pl.totalGoals,
								won,
							});

							const stats = getUserStats(userId);
							const newlyUnlocked = stats ? checkForNewUnlocks(userId, stats.score) : [];
							if (newlyUnlocked.length > 0 && authSocket) {
								authSocket.emit("unlockReveal", newlyUnlocked);
							}

							const previousRank = Math.floor(previousScore / 1000);
							const newRank = stats ? Math.floor(stats.score / 1000) : previousRank;
							if (newRank > previousRank && authSocket) {
								for (let r = previousRank + 1; r <= newRank; r++) {
									grantCrate(userId, "rank_up");
								}
								authSocket.emit("rankUp", newRank);
							}

							// round stats just hit the DB — push the finalized account
							// stats so the client's profile replaces its live projection
							if (authSocket) {
								emitAccountStats(authSocket as AuthenticatedSocket);
							}
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
		console.log(`[kill] [${this.name}] ${killMessage}`);
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

		// Emit real-time quest progress to killer and victim
		this.emitQuestProgressForPlayer(source);
		if (!isSuicide) {
			this.emitQuestProgressForPlayer(dest);
		}
	}

	/** Emit live quest progress snapshot to a player's socket after kill/death/damage. */
	private emitQuestProgressForPlayer(player: Player) {
		if (!player.socketId || player.isBot) return;
		const authSocket = this.io.sockets.get(player.socketId) as AuthenticatedSocket | undefined;
		const userId = authSocket?.userId;
		if (!userId) return;

		const snapshot = getQuestProgressSnapshot(userId, {
			kills: player.kills,
			deaths: player.deaths,
			damage: Math.abs(player.totalDamage),
			healing: player.totalHealing,
			goals: player.totalGoals,
			score: player.score,
			won: false, // unknown at kill time, will be corrected at round end
		});
		authSocket.emit("questProgressUpdate", snapshot);

		// keep the client's profile chip live too: project the not-yet-persisted
		// round stats on top of the DB account stats, same as the quest snapshot
		// (skips emitClanStats — clan stats are too heavy to recompute per kill)
		if (authSocket.username) {
			const payload = buildAccountPayload(userId, authSocket.username, {
				score: player.score,
				kills: player.kills,
				deaths: player.deaths,
			});
			if (payload) authSocket.emit("updAccStat", payload);
		}
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
