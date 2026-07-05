import type { Socket } from "socket.io-client";
import { characterClasses } from "./loadouts.ts";
import * as cosmetics from "./skins.ts";
import { sprays } from "./sprays.ts";
import type { Camo, Hat, MapData, Player, Shirt, Sprite } from "./types.ts";

export type QuestItem = {
	id: number;
	name: string;
	reward: string;
	goal: number;
	progress: number;
	claimed: boolean;
	claimable: boolean;
	questKey: string;
};

export type QuestStreak = {
	day: number;
	claimed: boolean;
	rewardLabel: string;
};

// what a crate awards; mirrors the server's openCrateForUser return shape
export type CrateWonItem = {
	itemType: "hat" | "shirt" | "camo";
	itemId: number;
	itemName: string;
	chance: number;
};

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

// parse a JSON object stored in localStorage, tolerating missing/corrupted values
// (a bad value must not throw at module load and break the whole app)
function parseStoredObject(key: string): object {
	try {
		const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
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
		// seed from the local catalog so the loadout works before any room is
		// joined; the server re-sends these (including mods) over updHt/updShrt/
		// updCmo once the player actually connects to a room
		hats: [...cosmetics.hats] as Hat[],
		shirts: [...cosmetics.shirts] as Shirt[],
		camos: [cosmetics.camos] as unknown as Camo[][],
	},
	// item ids the logged-in player owns; empty sets for guests (who keep
	// today's free-selection behavior everywhere else in the app)
	unlockedItems: {
		hat: new Set<number>(),
		shirt: new Set<number>(),
		camo: new Set<number>(),
	},
	unopenedCrateCount: 0,
	// drives the single shared reward popup mounted in App.svelte
	rewardPopup: null as
		| null
		| { kind: "unlocks"; items: { name: string; chance: number }[] }
		| { kind: "rankUp"; rank: number }
		| { kind: "pendingCrates"; count: number }
		| { kind: "crateOpen"; won: CrateWonItem | null },
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
	// bumped whenever a mod/base asset pack finishes (re)loading its sprite sheets,
	// so reactive views like the menu LoadoutPreview re-render with the new sprites
	assetVersion: 0,
	kicked: false,
	startingGame: false,
	changingLobby: false,
	gameStart: false,
	gameOver: false,
	currentLiked: null as number | null,
	mobile: false,
	socket: null as Socket | null,
	room: null as string | null,
	// which main-menu modal is open (null = none)
	menuModal: null as null | "account" | "rooms" | "settings" | "controls" | "mods",
	// quest system state
	quests: {
		daily: [] as QuestItem[],
		weekly: null as QuestItem | null,
		streak: { day: 0, claimed: false, rewardLabel: "" } as QuestStreak,
		dailyReset: "",
		weeklyReset: "",
	},
	// status/feedback text rendered by StatusMessage components; shared because
	// socket handlers in app.tsx write them too
	messages: {
		login: "",
		clanDB: "Join or Create a Clan.",
		clanInv: "Invite or Kick Members.",
		clanCht: "(eg. Discord URL)",
		editProfile: "Edit Profile Info.",
		serverCreate: "Press start to start the Server.",
	},
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
			// default true: preserves the always-visible ALL/TEAM toggle that existed
			// before this setting was wired up; unchecking now hides it (e.g. FFA-only players)
			selectChat: true,
		},
		parseStoredObject("settings"),
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
		parseStoredObject("keysList"),
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
