import { gameModes } from "core/src/gamemodes.ts";
import { weapons } from "core/src/loadouts.ts";
import { Projectile } from "core/src/logic/projectile.ts";
import { sprays } from "core/src/sprays.ts";
import type {
	ClutterObject,
	GameMode,
	GenData,
	MapData,
	PickupObject,
	Player,
	Tile,
} from "core/src/types.ts";
import { getDistance, randomInt, setupMap } from "core/src/utils.ts";
import { defaultGenData } from "./maps.ts";

export class Game {
	roomName = "";
	players: Player[] = [];
	maxPlayers = 8;
	mode: GameMode;
	mapData: MapData;
	tileScale = 256;
	tiles: Tile[] = [];
	spawnTiles: Tile[] = [];
	scoreTiles: Tile[] = [];
	clutter: ClutterObject[] = [];
	pickups: PickupObject[] = [];
	bullets: Projectile[] = [];
	weapons = structuredClone(weapons);
	nextSid = 0;
	score = {
		red: 0,
		blue: 0,
		lb: 0,
	};
	modeVotes = gameModes.map((m, i) => ({
		name: m.name,
		indx: i,
		votes: 0,
	}));
	roundEnd = false;
	mults = {
		health: 1,
		speed: 1,
	};

	constructor(name: string) {
		this.roomName = name;
		this.mode = gameModes[0];
		this.mapData = this.newMap(defaultGenData[this.mode.maps[0]]);
	}

	newPlayer() {
		let sid = this.nextSid;
		this.nextSid++;
		let tmpPlayer: Player = {
			id: sid,
			room: this.roomName,
			index: sid,
			name: "UNKNOWN",
			account: { clan: "DEV", rank: 0 },
			classIndex: 0,
			currentWeapon: 0,
			weapons: [this.weapons[0]],
			health: 0,
			maxHealth: 0,
			height: 100,
			width: 50,
			speed: 0.5,
			jumpY: 0,
			jumpDelta: 0,
			jumpStrength: 0,
			gravityStrength: 0,
			jumpCountdown: 0,
			frameCountdown: 0,
			scoreCountdown: 0,
			kills: 0,
			deaths: 0,
			score: 0,
			angle: 0,
			x: 0,
			y: 0,
			oldX: 0,
			oldY: 0,
			totalDamage: 0,
			totalHealing: 0,
			totalGoals: 0,
			damageSources: {},
			killStreak: 0,
			isSpawnProtected: false,
			nameYOffset: 0,
			dead: true,
			onScreen: false,
			delta: 0,
			targetF: 0,
			animIndex: 0,
			team: this.getTeam(sid),
			firstReceive: true,
			isBoss: false,
			spray: {
				src: "/assets/sprays/1.png",
				...sprays[0],
			},
			isInHardpoint: false,
			hardpointScore: 0,
			likedBy: [],
		};
		this.players.push(tmpPlayer);
		return tmpPlayer;
	}

	getTeam(sid: number) {
		let team = "";
		if (this.mode.teams) {
			const red = this.players.filter((pl) => pl.team === "red").length;
			const blue = this.players.filter((pl) => pl.team === "blue").length;
			if (this.mode.code === "boss") {
				team = blue > 0 ? "red" : "blue";
			} else {
				team = red >= blue ? "blue" : "red";
			}
		} else {
			team = `${sid}`;
		}
		return team;
	}

	newMap(genData: GenData) {
		this.tiles = [];
		this.clutter = [];
		this.pickups = [];
		this.spawnTiles = [];
		this.scoreTiles = [];
		let tmpMap = {
			gameMode: this.mode,
			genData: genData,
			tiles: this.tiles,
			clutter: this.clutter,
			pickups: this.pickups,
			width: (genData.width - 4) * this.tileScale,
			height: (genData.height - 4) * this.tileScale,
		};
		setupMap(tmpMap, this.tileScale, []);
		for (const tl of this.tiles) {
			if (!tl.hardPoint) {
				if (
					tl.objTeam === "red" ||
					(tl.objTeam === "blue" && this.mode.teams)
				) {
					this.spawnTiles.push(tl);
				}
			} else if (this.mode.code === "hp" || this.mode.code === "zmtch") {
				this.scoreTiles.push(tl);
			}
		}
		return tmpMap;
	}

	getSpawn(player: Player) {
		const spawnTiles = this.mode.teams
			? this.spawnTiles.filter((tile) => tile.objTeam === player.team)
			: this.spawnTiles;
		const activeEnemies = this.players.filter(
			(plr) =>
				!plr.dead &&
				plr.onScreen &&
				plr.index !== player.index &&
				(!this.mode.teams || plr.team !== player.team),
		);
		const tileMid = this.tileScale / 2;

		let bestSpawnPosition = { x: tileMid, y: tileMid };
		let bestSpawnDistance = -Infinity;

		for (const tl of spawnTiles) {
			const spawnPosition = { x: tl.x + tileMid, y: tl.y + tileMid };
			const closestEnemyDistance = Math.min(
				...activeEnemies.map((plr) =>
					getDistance(plr.x, plr.y, spawnPosition.x, spawnPosition.y),
				),
			);
			if (closestEnemyDistance > bestSpawnDistance) {
				bestSpawnPosition = spawnPosition;
				bestSpawnDistance = closestEnemyDistance;
			}
		}

		return bestSpawnPosition;
	}

	genClutter() {
		let nextID = 0;
		for (const tl of this.tiles) {
			if (tl.spriteIndex === 0 && !tl.wall) {
				const rand = randomInt(0, 10);
				if (rand > 0) continue;
				let clt = {
					x: tl.x,
					y: tl.y,
					active: true,
					indx: nextID++,
					i: randomInt(1, 2),
					w: 48,
					h: 84,
					hc: true,
					tp: 1,
					s: true,
				};
				const randY = randomInt(tl.scale / 4, (tl.scale / 4) * 3);
				if (tl.left) {
					clt.y += randY;
				} else if (tl.right) {
					clt.x += tl.scale - clt.w;
					clt.y += randY;
				} else {
					continue;
				}
				this.clutter.push(clt);
			}
		}
	}

	genPickups() {
		const mid = this.tileScale / 2;
		for (const tl of this.tiles) {
			let pkup = {
				x: tl.x + mid,
				y: tl.y + mid,
				active: false,
				scale: 64,
				type: "",
			};
			if (tl.spriteIndex === 2) {
				pkup.type = "healthpack";
				pkup.active = true;
				this.pickups.push(pkup);
			} else if (tl.spriteIndex === 1 && this.mode.code === "lc") {
				pkup.type = "lootcrate";
				this.pickups.push(pkup);
			}
		}
	}

	newRound(modeIndex: number, genData?: GenData) {
		this.bullets = [];
		this.score.red = 0;
		this.score.blue = 0;
		this.score.lb = 0;
		this.mode = gameModes[modeIndex];
		const mapIndex = this.mode.maps[randomInt(0, this.mode.maps.length - 1)];
		this.mapData = genData
			? this.newMap(genData)
			: this.newMap(defaultGenData[mapIndex]);
		for (const m of this.modeVotes) {
			m.votes = 0;
		}
		for (const pl of this.players) {
			pl.x = 0;
			pl.y = 0;
			pl.score = 0;
			pl.kills = 0;
			pl.deaths = 0;
			pl.totalDamage = 0;
			pl.totalHealing = 0;
			pl.totalGoals = 0;
			pl.isBoss = false;
			pl.onScreen = false;
			pl.dead = true;
			pl.lastModeVote = undefined; //TODO
			pl.team = this.getTeam(pl.index);
			pl.firstReceive = true;
			pl.likedBy = [];
		}
		this.genClutter();
		this.genPickups();
		for (let i = 0; i < 100; i++) {
			const newBullet = new Projectile();
			newBullet.serverIndex = i;
			this.bullets.push(newBullet);
		}
		this.roundEnd = false;
	}
}
