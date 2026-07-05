import type { camos, hats, shirts } from "./skins.ts";

export type Player = {
	id: number;
	room: string;
	index: number;
	name: string;
	account: Account;
	classIndex: number;
	currentWeapon: number;
	weapons: Weapon[];
	health: number;
	maxHealth: number;
	height: number;
	width: number;
	speed: number;
	jumpY: number;
	jumpDelta: number;
	jumpStrength: number;
	gravityStrength: number;
	jumpCountdown: number;
	frameCountdown: number;
	scoreCountdown: number;
	kills: number;
	deaths: number;
	score: number;
	angle: number;
	x: number;
	y: number;
	oldX: number;
	oldY: number;
	isSpawnProtected: boolean;
	nameYOffset: number;
	dead: boolean;
	onScreen: boolean;
	delta: number;
	targetF: number;
	animIndex: number;
	team: string;
	isBoss: boolean;
	loggedIn?: boolean;
	socketId?: string;
	// server-controlled AI player (no socket); never writes stats
	isBot?: boolean;
	likedBy: number[];
	totalDamage: number;
	totalHealing: number;
	totalGoals: number;
	damageSources: Record<number, number>; // Player ID : dmg inflicted by player
	killStreak: number;
	lastModeVote?: number;
	xSpeed?: number;
	ySpeed?: number;
	isn?: number;
	// Currently setting this to true if first spawn into current round, thus needs to receive game mode banner notif.
	firstReceive?: boolean;
	spray: Spray;
	lastItem?: any; // todo (server-side)
	hitFlash?: number;
	isInHardpoint: boolean;
	hardpointScore: number;
};

type WeaponBase = {
	name: string;
	// sprite folder under sprites/weapons/ when it differs from name (e.g. "???" boss weapons)
	spriteFolder?: string;
	weaponIndex: number;
	dmg: number;
	ammo: number;
	maxAmmo: number;
	reloadSpeed: number;
	fireRate: number;
	spread: number[];
	width: number;
	length: number;
	yOffset: number;
	holdDist: number;

	bSpeed: number;
	bWidth: number;
	bHeight: number;
	bRandScale: [number, number];
	cAcc: number;
	maxLife: number | null;
	bulletsPerShot: number;
	pierce: number;
	pierceCount: number;
	blastRadius?: number;
	bounce: boolean;
	distBased: boolean;
	explodeOnDeath: boolean;
	bDist: number;
	bTrail: number;
	bSprite: number;
	glowWidth: number;
	glowHeight: number;
	shake: number;
	selfDamage?: boolean;

	reloadTime: number;
	spreadIndex: number;
	lastShot: number;

	// added at runtime
	front?: boolean;
	camo?: number;
};

export type Weapon = WeaponBase &
	(
		| { explodeOnDeath: true; blastRadius: number }
		| { explodeOnDeath: false; blastRadius?: undefined }
	);

export type Hat = (typeof hats)[number] & { count?: number };
export type Shirt = (typeof shirts)[number] & { count?: number };
export type Camo = (typeof camos)[number] & { count?: number }[];

export type Account = {
	// TODO: maybe these can be refactored into a property of type PlayerProfile?
	username?: string;
	avatar?: string; // discord avatar url, empty for password accounts
	clan?: string;
	rank: number; // note: even guests have a rank for a given session
	rankPercent?: number;
	score?: number; // lifetime score (projected with in-round score during a game)
	worldRank?: number;
	likes?: number;
	kills?: number;
	deaths?: number;
	kd?: number;

	isClanOwner?: boolean;
	channel?: string;

	hat?: Hat;
	shirt?: Shirt;
	pendingCrates?: number;
};

export type Spray = {
	id: number;
	name: string;
	src: string;
	info: {
		scale: number;
		alpha: number;
		resolution: number;
	};
};

export type InputSendData = {
	hdt: number;
	vdt: number;
	ts: number;
	isn: number;
	s: number;
	delta: number;
};

export interface Sprite extends HTMLImageElement {
	index: number;
	isLoaded: boolean;
	flipped: boolean;
	//SPRAY
	owner?: number;
	active?: boolean;
	xPos?: number;
	yPos?: number;
	scale?: number;
	alpha?: number;
	resolution?: number;
}

export type CachedSpriteData = {
	lS: Sprite;
	uS: Sprite;
	rS: Sprite;
	dS: Sprite;
	imgToLoad: number;
};

export interface SpriteCanvas extends HTMLCanvasElement {
	index?: number;
	flipped?: boolean;
	isLoaded?: boolean;
}

export type Tile = {
	index: number;
	scale: number;
	x: number;
	y: number;
	wall: boolean;
	spriteIndex: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	topLeft: number;
	topRight: number;
	bottomLeft: number;
	bottomRight: number;
	neighbours: number;
	hasCollision: boolean;
	hardPoint: boolean;
	objTeam: string;
	edgeTile: boolean;
};

export type GameMode = {
	code: string;
	name: string;
	score: number;
	desc1: string;
	desc2: string;
	teams: boolean;
	maps: number[];
	killScoreMult: number;
};

export type MapObject = {
	x: number;
	y: number;
	active: boolean;
};

export interface ClutterObject extends MapObject {
	i: number; // 1 = regular barrel; 2 = explosive barrel
	w: number;
	h: number;
	s?: boolean; // has shadows
	hc: boolean; //?
	tp: number; //?
}

export interface PickupObject extends MapObject {
	scale: number;
	type: string;
}

export interface FlagObject extends MapObject {
	team: string;
	w: number;
	h: number;
	ai: number; // ?
	ac: number; // ?
}

export type GenData = {
	width: number;
	height: number;
	data: Uint8ClampedArray;
};

export type MapData = {
	gameMode: GameMode;
	genData: GenData;
	tiles: Tile[];
	clutter: ClutterObject[];
	pickups: PickupObject[];
	width: number;
	height: number;
};

// todo gather types for socket events/packets together
export type ShootEvent = {
	i: number;
	x: number;
	y: number;
	d: number;
	si: number;
};

export type ZoneEvent = {
	indx: number;
	score: number;
	newX?: number;
	newY?: number;
};

export type LeaderboardData = {
	rank: PlayerProfile[];
	kdrThousand: PlayerProfile[];
	kdrAny: PlayerProfile[];
	kills: PlayerProfile[];
	clanRank: ClanProfile[];
	clanKdr: ClanProfile[];
};

export type LeaderboardType = keyof LeaderboardData;

export type LeaderboardEntry = {
	clanText: string;
	text: string;
	link?: string;
};

export type PlayerProfile = {
	name: string;
	worldRank: number;
	rank: number;
	score: number;
	kdr: number;
	numKills: number;
	numDeaths: number;
	numLikes: number;
	numHats: number;
	clan?: string;
};

export type ClanProfile = {
	id: number;
	name: string;
	position: number;
	rank: number;
	kdr: number;
	owner: string;
	numMembers: number;
};

export type StatTableRow = {
	player: Player;
	cells: StatTableCell[];
};

export type StatTableCell = {
	className: string;
	text: string | number;
	color: string;
	canClick?: boolean;
	hoverInfo?: StatTableCellHoverInfo;
};

export type StatTableCellHoverInfo = {
	id: string;
	type: "hat" | "shirt" | "camo";
	name: string;
	chance: number;
	isDuplicate: boolean;
	desc?: string;
	weaponName?: string;
	creator?: string;
};
