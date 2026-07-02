import { Howl } from "howler";
import { st } from "./state.svelte.ts";
import { getDistance } from "./utils.ts";

// todo logic cleanup

let soundList: Record<
	string,
	{
		loc: string;
		id: string;
		sound: Howl;
		loop: boolean;
		onload?: () => void;
	}
> = {};
const soundMeta = [
	{
		loc: "weapons/smg",
		id: "shot0",
		loop: false,
	},
	{
		loc: "weapons/revolver",
		id: "shot1",
		loop: false,
	},
	{
		loc: "weapons/sniper",
		id: "shot2",
		loop: false,
	},
	{
		loc: "weapons/toygun",
		id: "shot3",
		loop: false,
	},
	{
		loc: "weapons/shotgun",
		id: "shot4",
		loop: false,
	},
	{
		loc: "weapons/grenades",
		id: "shot5",
		loop: false,
	},
	{
		loc: "weapons/rockets",
		id: "shot6",
		loop: false,
	},
	{
		loc: "weapons/pistol",
		id: "shot7",
		loop: false,
	},
	{
		loc: "weapons/minigun",
		id: "shot8",
		loop: false,
	},
	{
		loc: "weapons/flamethrower",
		id: "shot9",
		loop: false,
	},
	{
		loc: "characters/footstep1",
		id: "step1",
		loop: false,
	},
	{
		loc: "characters/jump1",
		id: "jump1",
		loop: false,
	},
	{
		loc: "characters/death1",
		id: "death1",
		loop: false,
	},
	{
		loc: "characters/kill1",
		id: "kill1",
		loop: false,
	},
	{
		loc: "special/explosion",
		id: "explosion",
		loop: false,
	},
	{
		loc: "special/score",
		id: "score",
		loop: false,
	},
	{
		loc: "tracks/track1",
		id: "track1",
		loop: true,
		onload: () => {
			if (st.player.dead && !st.startingGame) {
				soundList.track1.sound.play();
				currentTrack = 1;
			}
		},
	},
	{
		loc: "tracks/track2",
		id: "track2",
		loop: true,
		onload: () => {
			if (!st.player.dead && st.gameStart && !st.gameOver) {
				soundList.track2.sound.play();
				currentTrack = 2;
			}
		},
	},
];
export function loadSounds(base: string) {
	if (!st.doSounds) {
		return false;
	}
	soundList = {};
	for (const meta of soundMeta) {
		const tmpSound = localStorage.getItem(`${base + meta.loc}data`);
		const tmpFormat = localStorage.getItem(`${base + meta.loc}format`);
		if (!tmpSound || !tmpFormat) {
			console.error(`sound info for ${meta.id} ${meta.loc} is missing from localstorage`);
			continue;
		}
		loadSound(tmpSound, meta, tmpFormat);
	}
}
function loadSound(src: string, sound: (typeof soundMeta)[number], format: string) {
	soundList[sound.id]?.sound?.stop();

	soundList[sound.id] = {
		...sound,
		sound: new Howl({
			src,
			format,
			loop: sound.loop,
			onload: sound.onload || (() => {}),
		}),
	};
}
var currentTrack = 0;
export function startSoundTrack(id: number) {
	if (!st.doSounds || !soundList.track1 || !soundList.track2) {
		return false;
	}
	try {
		if (id === 1) {
			if (currentTrack !== id) {
				currentTrack = id;
				soundList.track1.sound.play();
				soundList.track1.sound.fade(0, 1, 1000);
			}
			soundList.track2.sound.stop();
		} else {
			if (currentTrack !== id) {
				currentTrack = id;
				soundList.track2.sound.play();
				soundList.track2.sound.fade(0, 1, 1000);
			}
			soundList.track1.sound.stop();
		}
	} catch (b) {
		console.log(b);
	}
}
var maxHearDist = 1500;
export function playSound(soundId: string, x: number, y: number) {
	if (!st.kicked && st.doSounds) {
		try {
			const dist = getDistance(st.player.x, st.player.y, x, y);
			if (dist <= maxHearDist) {
				const soundEntry = soundList[soundId];
				if (soundEntry !== undefined) {
					const { sound } = soundEntry;
					sound.volume(Math.round((1 - dist / maxHearDist) * 10) / 10);
					sound.play();
				}
			}
		} catch (e) {
			console.log(e);
		}
	}
}
export function stopAllSounds() {
	if (!st.doSounds) {
		return false;
	}
	for (const meta of soundMeta) {
		soundList[meta.id].sound.stop();
	}
}
