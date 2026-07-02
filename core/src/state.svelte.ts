import type { Socket } from "socket.io-client";
import { characterClasses } from "./loadouts.ts";
import * as cosmetics from "./skins.ts";
import { sprays } from "./sprays.ts";
import type { Camo, Hat, MapData, Player, Shirt, Sprite } from "./types.ts";

function getCosmeticPref<T extends { id: number }>(data: T[], key: string): T | null {
	const value = localStorage.getItem(key);
	console.debug(`loading ${value} from ${key}`);
	if (value && !Number.isNaN(parseInt(value)))
		return data.find((item) => item.id === parseInt(value)) ?? null;
	return null;
}

function getClassPref() {
	const value = localStorage.getItem("prevClass");
	return characterClasses.find((c) => c.folderName === value) ?? characterClasses[0];
}

function getSprayPref() {
	const value = localStorage.getItem("prevSpray");
	if (value && !Number.isNaN(parseInt(value))) {
		const sprayId = parseInt(value);
		return sprays.find((spray) => spray.id === sprayId) ?? null;
	}
	return null;
}

export const st = $state({
	gameMap: null as unknown as MapData,
	maxScreenWidth: 1920,
	maxScreenHeight: 1080,
	viewMult: 1,
	startX: 0,
	startY: 0,
	// hack, since maybe this is accessed before gameSetup?
	player: {
		dead: true,
		weapons: [],
	} as unknown as Player,
	loggedIn: false,
	clanData: {} as Record<string, string | number>,
	playerName: "", // content of the player name input box
	loadout: {
		class: getClassPref(),
		primaryCamo: getCosmeticPref(cosmetics.camos, "prevPrimaryCamo"),
		secondaryCamo: getCosmeticPref(cosmetics.camos, "prevSecondaryCamo"),
		hat: getCosmeticPref(cosmetics.hats, "prevHat"),
		shirt: getCosmeticPref(cosmetics.shirts, "prevShirt"),
		spray: getSprayPref(),
	},
	cosmetics: {
		hats: [] as Hat[],
		shirts: [] as Shirt[],
		camos: [] as Camo[][],
	},
	sprays,
	characterClasses,
	shake: {
		x: 0,
		y: 0,
		scale: 0,
		dir: 0,
	},
	sprites: {
		light: null as Sprite | null,
		particles: [] as Sprite[],
		weapons: [] as {
			upSprite: Sprite;
			downSprite: Sprite;
			leftSprite: Sprite;
			rightSprite: Sprite;
			icon: HTMLImageElement;
		}[],
	},
	doSounds: false,
	kicked: false,
	startingGame: false,
	changingLobby: false,
	gameStart: false,
	gameOver: false,
	currentLiked: null as number | null,
	mobile: false,
	socket: null as Socket | null,
	room: null as string | null,
	hostSecret: null as string | null,
	isHost: false,
	settings: Object.assign(
		{
			showNames: true,
			showParticles: true,
			showTrippy: false,
			showSprays: true,
			showFade: true,
			showShadows: true,
			showGlows: true,
			showBTrails: true,
			showChat: true,
			showUI: true,
			showPINGFPS: true,
			showLeader: true,
			selectChat: false,
		},
		JSON.parse(localStorage.getItem("settings") ?? "{}") as object,
	),
	keysList: Object.assign(
		{
			upKey: "KeyW",
			downKey: "KeyS",
			leftKey: "KeyA",
			rightKey: "KeyD",
			reloadKey: "KeyR",
			jumpKey: "Space",
			sprayKey: "KeyF",
			leaderboardKey: "ShiftLeft",
			chatToggleKey: "Enter",
			incWeapKey: "KeyE",
			decWeapKey: "KeyQ",
		},
		JSON.parse(localStorage.getItem("keysList") ?? "{}") as object,
	),
	chatLines: [] as {
		text: string;
		source: "system" | "notif" | "me" | "blue" | "red";
		author: string;
	}[],
	players: [] as Player[],
});

declare global {
	interface Window {
		st: typeof st;
	}
}
window.st = st;
