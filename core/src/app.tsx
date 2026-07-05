import * as zip from "@zip.js/zip.js";
import { io, type Socket } from "socket.io-client";
import { flushSync, mount } from "svelte";
import { resetCooldownAnimations } from "./components/ActionBar.svelte";
import App from "./components/App.svelte";
import { weaponNames, weapons } from "./loadouts.ts";
import { Projectile } from "./logic/projectile.ts";
import { loadSounds, playSound, startSoundTrack, stopAllSounds } from "./sound.ts";
import { st } from "./state.svelte.ts";
import type {
	Account,
	CachedSpriteData,
	Camo,
	ClutterObject,
	FlagObject,
	GameMode,
	Hat,
	InputSendData,
	Player,
	Shirt,
	ShootEvent,
	Sprite,
	SpriteCanvas,
	Tile,
	ZoneEvent,
} from "./types.ts";
import * as utils from "./utils.ts";
import {
	deactiveAllAnimTexts,
	renderShadedAnimText,
	showNotification,
	startBigAnimText,
	startMovingAnimText,
	updateAnimTexts,
	updateNotifications,
} from "./visual/animtext.ts";
import { updateFlashGlows } from "./visual/flash.ts";
import {
	createExplosion,
	createLiquid,
	createSmokePuff,
	particleCone,
	stillDustParticle,
	updateParticles,
} from "./visual/particle.ts";
import { screenShake, updateScreenShake } from "./visual/shake.ts";

const {
	shootNextBullet,
	getNextBullet,
	setupMap,
	wallCol,
	getCurrentWeapon,
	snapAngleToCardinal,
	isWeaponFacingFront,
	randomInt,
	canSee,
	TeamColors,
	getItemRarityColor,
} = utils;

mount(App, {
	target: document.querySelector("body")!,
});
flushSync();

var socket: Socket = null!; // O_O
var reason: string | undefined;
var fillCounter = 0;
var delta = 0;
var currentTime = Date.now();
var oldTime = Date.now();
var inputNumber = 0;
var thisInput: InputSendData[] = [];

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)) {
	st.mobile = true;
	hideMenuUI();
	hideUI(true);
	alert("tried to open google play");
	// openGooglePlay(false);
}
var inMainMenu = true;

const loadingWrapper = document.getElementById("loadingWrapper")!;

declare global {
	interface Window {
		startGame: typeof startGame;
	}
}
window.startGame = startGame;
async function startGame() {
	if (!st.startingGame && !st.changingLobby) {
		st.startingGame = true;
		st.playerName = st.playerName.replace(/(<([^>]+)>)/gi, "").substring(0, 25);

		document.getElementById("loadText")!.textContent = "LOADING ASSETS";
		loadingWrapper.style.display = "block";
		await assetsLoadPromise;
		loadingWrapper.style.display = "none";

		enterGame();
		if (inMainMenu) {
			loadingWrapper.style.display = "block";
			document.getElementById("loadText")!.textContent = "CONNECTING";
		}
	}
}
function enterGame() {
	startSoundTrack(2);
	document.getElementById("startMenuWrapper")!.style.display = "none";
	mainCanvas.focus();
	if (!st.room) {
		socket.emit("create");
	}
	hideMenuUI();
	animateOverlay = true;
	if (st.player.dead) {
		socket.emit("respawn");
		resetCooldownAnimations();
		updateGameLoop();
	} else {
		inMainMenu = false;
		st.startingGame = false;
		if (st.gameOver) {
			document.getElementById("gameStatWrapper")!.style.display = "block";
		} else {
			showUI();
		}
	}
}
var clanStats = document.getElementById("clanStats")!;
var clanSignUp = document.getElementById("clanSignUp")!;
var clanHeader = document.getElementById("clanHeader")!;
var clanAdminPanel = document.getElementById("clanAdminPanel")!;
var leaveClanButton = document.getElementById("leaveClanButton")!;
var clanChatLink = document.getElementById("clanChatLink")!;

const oauthErrorMessages: Record<string, string> = {
	oauth_failed: "Discord login failed. Please try again.",
	invalid_state: "Discord login expired. Please try again.",
	no_code: "Discord login was cancelled.",
	access_denied: "Discord login was cancelled.",
};
function showLoginError(error: string) {
	st.messages.login = oauthErrorMessages[error] ?? `Login error: ${error}`;
}

// surface errors from the OAuth callback redirect (/?error=...) and strip the
// param before window.onload interprets location.search as a room code
const oauthError = new URLSearchParams(location.search).get("error");
if (oauthError) {
	history.replaceState(null, "", "/");
	showLoginError(oauthError);
}

// the OAuth popup posts back here when it finishes (see /api/auth/discord?popup=1)
window.addEventListener("message", (event) => {
	if (event.origin !== location.origin) return;
	if (!event.data || event.data.type !== "vertix:discord-login") return;
	if (event.data.error) {
		showLoginError(event.data.error);
	} else {
		refreshLogin();
	}
});

// pick up the session cookie without reloading: apply the account to the UI and,
// when safely in the menu, reconnect the room socket so its handshake (which is
// what ties round stats to the account) carries the fresh session
async function refreshLogin(): Promise<boolean> {
	const resp = await fetch("/api/auth/me");
	if (!resp.ok) return false;
	const account = (await resp.json()) as Account;
	applyAccount(account);
	if (!st.gameStart && st.room && !st.changingLobby) {
		const room = st.room;
		st.player.room = "";
		joinRoom(room);
	}
	return true;
}
window.refreshLogin = refreshLogin;

window.onload = async () => {
	if (st.mobile) {
		document.getElementById("loadText")!.textContent = "MOBILE VERSION COMING SOON";
		return;
	}
	drawMenuBackground();
	hideUI(true);
	resize();
	const anim = loadingWrapper.animate({ opacity: [1, 0] }, 200);
	anim.finished.then(() => {
		loadingWrapper.style.display = "none";
	});

	// only join automatically when the URL carries an explicit invite (?ROOMCODE);
	// otherwise autojoin the best available room
	const roomName = location.search.substring(1) || "";
	if (roomName) {
		joinRoom(roomName);
	} else {
		// autojoin: fetch the best available room from the server
		fetch("/api/autoJoin")
			.then((r) => r.json())
			.then((data: { room: string | null }) => {
				if (data.room) {
					joinRoom(data.room);
				}
			})
			.catch(() => {});
	}
};

var newUsernameInput = document.getElementById("newUsernameInput")! as HTMLInputElement;
var youtubeChannelInput = document.getElementById("youtubeChannelInput")! as HTMLInputElement;
// shown at most once per page load, the first time we learn crates are
// waiting — later room switches/reconnects push the same account payload
// again and shouldn't re-open the popup every time
var pendingCratesModalShown = false;
// applies a logged-in account to the UI; receives the server's "updAccStat"
// payload (pushed when the socket carries a valid session cookie) and the
// /api/auth/me response after an OAuth popup login
function applyAccount(account: Account) {
	if (account.username) {
		st.playerName = account.username;
		localStorage.setItem("userName", account.username);
		st.loggedIn = true;
		st.player.loggedIn = true;
		const user = findUserByIndex(st.player.index);
		if (user) {
			user.loggedIn = true;
		}
		// request quest data for this user
		socket?.emit("getQuests");
	}
	if (typeof account.pendingCrates === "number") {
		st.unopenedCrateCount = account.pendingCrates;
		if (account.pendingCrates > 0 && !pendingCratesModalShown) {
			pendingCratesModalShown = true;
			st.rewardPopup = { kind: "pendingCrates", count: account.pendingCrates };
		}
	}
	updateAccountPage(account);
}
function updateAccountPage(a: Account) {
	st.player.account = a;
	// legacy element: removed from AccountTab.svelte, may not exist
	const profileButton = document.getElementById("profileButton");
	if (profileButton) {
		profileButton.onclick = () => {
			if (st.player.account.username) {
				showUserStatPage(st.player.account.username);
			}
		};
	}
	newUsernameInput.value = st.player.account.username ?? "";
	youtubeChannelInput.value = st.player.account.channel ?? "";
	document.getElementById("saveAccountData")!.onclick = () => {
		socket.emit("dbEditUser", {
			userName: newUsernameInput.value,
			userChannel: youtubeChannelInput.value,
		});
		st.messages.editProfile = "Please Wait...";
	};
	clanAdminPanel.style.display = "none";
	leaveClanButton.style.display = "none";
	if (a.clan !== "") {
		clanSignUp.style.display = "none";
		clanStats.style.display = "block";
		leaveClanButton.style.display = "inline-block";
		leaveClanButton.textContent = "LEAVE CLAN";
		clanHeader.textContent = `[${a.clan}] CLAN:`;
		if (a.isClanOwner) {
			clanAdminPanel.style.display = "block";
			leaveClanButton.textContent = "DELETE CLAN";
		}
	} else {
		clanSignUp.style.display = "block";
		clanStats.style.display = "none";
		clanHeader.textContent = "Clans";
	}
}
function showUserStatPage(userName: string) {
	window.open(`/profile.html?${userName}`, "_blank");
}
var gameWidth = 0;
var gameHeight = 0;
var uiScale = 1;
calculateUIScale();
var gameOverFade = false;
var disconnected = false;
var textSizeMult = 0.55;
var gameMode: GameMode | null = null;

var target = {
	f: 0,
	d: 0,
	dOffset: 0,
};
let clutter: ClutterObject[] = [];
let flags: FlagObject[] = [];
let bullets: Projectile[] = [];

var mapTileScale = 0;
const keys = {
	u: false,
	d: false,
	l: false,
	r: false,
	lm: false,
	s: false,
	rl: false,
};
var mainCanvas = document.getElementById("cvs")! as HTMLCanvasElement;
mainCanvas.width = window.innerWidth;
mainCanvas.height = window.innerHeight;
mainCanvas.addEventListener("mousemove", gameInput, false);
mainCanvas.addEventListener("mousedown", mouseDown, false);
mainCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
mainCanvas.addEventListener("drag", mouseDown, false);
mainCanvas.addEventListener("click", focusGame, false);
mainCanvas.addEventListener("mouseup", mouseUp, false);
var lastAngle = 0;
var lastDist = 0;
var targetChanged = true;
function focusGame() {
	mainCanvas.focus();
}
function gameInput(event: MouseEvent) {
	event.preventDefault();
	event.stopPropagation();
	var b = getCurrentWeapon(st.player)?.yOffset ?? 0;
	let mouseX = event.clientX;
	let mouseY = event.clientY;
	lastAngle = target.f;
	lastDist = target.d;
	target.d = Math.sqrt(
		(mouseY - (window.innerHeight / 2 - b / 2)) ** 2 + (mouseX - window.innerWidth / 2) ** 2,
	);
	target.d *= Math.min(
		st.maxScreenWidth / window.innerWidth,
		st.maxScreenHeight / window.innerHeight,
	);
	target.f = Math.atan2(window.innerHeight / 2 - b / 2 - mouseY, window.innerWidth / 2 - mouseX);
	target.f = utils.roundNumber(target.f, 2);
	target.d = utils.roundNumber(target.d, 2);
	target.dOffset = utils.roundNumber(target.d / 4, 1);
	if (lastAngle !== target.f || lastDist !== target.d) {
		targetChanged = true;
	}
	// lastTarget = target.f;
}
function mouseDown(event: MouseEvent) {
	if (event.button !== 0) return;
	event.preventDefault();
	event.stopPropagation();
	keys.lm = true;
}
function mouseUp(event: MouseEvent) {
	if (event.button !== 0) return;
	event.preventDefault();
	event.stopPropagation();
	keys.lm = false;
}
var userScroll = 0;
mainCanvas.addEventListener("wheel", (event) => {
	event.preventDefault();
	event.stopPropagation();
	userScroll = Math.max(-1, Math.min(1, event.deltaY));
});
var keyMap: Record<string, boolean> = {};
var showingScoreBoard = false;

window.addEventListener("keydown", keyDown, false);
function keyDown(event: KeyboardEvent) {
	if (document.activeElement === mainCanvas) {
		event.preventDefault();
		keyMap[event.code] = event.type === "keydown";
		if (event.code === "Escape" && st.gameStart) {
			showESCMenu();
		}
		if (event.code === st.keysList.upKey && !keys.u) {
			keys.u = !keyMap[st.keysList.downKey];
			keys.d = false;
		}
		if (event.code === st.keysList.downKey && !keys.d) {
			keys.u = false;
			keys.d = !keyMap[st.keysList.upKey];
		}
		if (event.code === st.keysList.leftKey && !keys.l) {
			keys.l = !keyMap[st.keysList.rightKey];
			keys.r = false;
		}
		if (event.code === st.keysList.rightKey && !keys.r) {
			keys.l = false;
			keys.r = !keyMap[st.keysList.leftKey];
		}
		if (keyMap[st.keysList.jumpKey] && !keys.s) {
			keys.s = true;
		}
		if (keyMap[st.keysList.reloadKey] && !keys.rl) {
			keys.rl = true;
		}
		if (event.code === st.keysList.chatToggleKey && keyMap[st.keysList.chatToggleKey]) {
			document.getElementById("chatInput")!.focus();
		}
		if (
			keyMap[st.keysList.leaderboardKey] &&
			st.gameStart &&
			!showingScoreBoard &&
			!st.player.dead &&
			!st.gameOver
		) {
			showingScoreBoard = true;
			showStatTable(null, null, true, true);
		}
	}
}
mainCanvas.addEventListener("keyup", keyUp, false);
function keyUp(event: KeyboardEvent) {
	event.preventDefault();
	keyMap[event.code] = event.type === "keydown";
	if (event.code === st.keysList.upKey) {
		keys.u = false;
		keys.d = keyMap[st.keysList.downKey];
	}
	if (event.code === st.keysList.downKey) {
		keys.u = keyMap[st.keysList.upKey];
		keys.d = false;
	}
	if (event.code === st.keysList.leftKey) {
		keys.l = false;
		keys.r = keyMap[st.keysList.rightKey];
	}
	if (event.code === st.keysList.rightKey) {
		keys.l = keyMap[st.keysList.leftKey];
		keys.r = false;
	}
	if (event.code === st.keysList.jumpKey) {
		keys.s = false;
	}
	if (event.code === st.keysList.reloadKey) {
		keys.rl = false;
	}
	if (event.code === st.keysList.incWeapKey) {
		playerSwapWeapon(findUserByIndex(st.player.index), 1);
	}
	if (event.code === st.keysList.decWeapKey) {
		playerSwapWeapon(findUserByIndex(st.player.index), -1);
	}
	if (event.code === st.keysList.sprayKey) {
		sendSpray();
	}
	if (
		event.code === st.keysList.leaderboardKey &&
		showingScoreBoard &&
		!st.player.dead &&
		!st.gameOver
	) {
		hideStatTable();
	}
}
function messageFromServer(a: [userIdx: number, userMsg: string]) {
	let tmpChatUser = findUserByIndex(a[0]);
	if (tmpChatUser != null) {
		if (tmpChatUser.index === st.player.index) return;
		window.addChatLine(
			tmpChatUser.name,
			a[1],
			tmpChatUser.index === st.player.index,
			tmpChatUser.team,
		);
	} else if (a[0] === -1) {
		window.addChatLine("", a[1], false, "system");
	} else {
		window.addChatLine("", a[1], false, "notif");
	}
}
const graph = mainCanvas.getContext("2d")!;
window.graph = graph;
declare global {
	interface Window {
		graph: CanvasRenderingContext2D;
	}
}
const mapCanvas = document.getElementById("mapc")! as HTMLCanvasElement;
const mapContext = mapCanvas.getContext("2d")!;
mapCanvas.width = 200;
mapCanvas.height = 200;
mapContext.imageSmoothingEnabled = false;

function kickPlayer(secondReason: string) {
	if (disconnected || st.changingLobby) return;
	hideStatTable();
	hideUI(true);
	hideMenuUI();
	document.getElementById("startMenuWrapper")!.style.display = "none";
	disconnected = true;
	st.gameOver = true;
	if (reason === undefined) {
		reason = secondReason;
	}
	st.kicked = true;
	socket.close();
	updateGameLoop();
	stopAllSounds();
}

let pingStart = 0;
function receivePing() {
	document.getElementById("pingText")!.replaceChildren(<>PING {Date.now() - pingStart}</>);
}
var pingInterval: ReturnType<typeof setInterval> | null = null;
function setupSocket(sock: Socket) {
	// logging, ignoring packets that are spammy
	sock.onAny((event, ...args) => {
		if (["pong1", "rsd"].includes(event)) return;
		console.info("%c <= ", "background:#FF6A19;color:#000", event, args);
	});
	sock.onAnyOutgoing((event, ...args) => {
		if (["ping1", "0", "4"].includes(event)) return;
		console.info("%c => ", "background:#7F7;color:#000", event, args);
	});
	sock.on("pong1", receivePing);
	if (pingInterval != null) {
		clearInterval(pingInterval);
	}
	pingInterval = setInterval(() => {
		pingStart = Date.now();
		sock.emit("ping1");
	}, 2000);
	sock.on("yourRoom", (roomName) => {
		st.room = roomName;
		st.changingLobby = false;
	});
	sock.on("connect_failed", () => {
		kickPlayer("Connection failed. Please check your internet connection.");
	});
	sock.on("disconnect", (reason) => {
		kickPlayer("Disconnected. Your connection timed out.");
		console.log(reason);
	});
	sock.on("error", (errorMsg) => {
		console.log("PLEASE NOTIFY THE DEVELOPER OF THE FOLLOWING ERROR");
		console.error(`ERROR: ${errorMsg}`);
	});
	sock.on("welcome", (player: Player, init: boolean) => {
		st.player.id = player.id;
		st.player.room = player.room;
		st.room = st.player.room;
		st.player.name = st.playerName;
		st.player.classIndex = player.classIndex = st.characterClasses.findIndex(
			(c) => c.folderName === st.loadout.class.folderName,
		);
		st.player.isInHardpoint = false;
		player.name = st.player.name;
		sock.emit("gotit", player, init, Date.now(), false);
		st.player.dead = true;
		if (init) {
			deactiveAllAnimTexts();
			st.gameStart = false;
			hideUI(false);
			document.getElementById("startMenuWrapper")!.style.display = "flex";
		}
		if (st.gameOver) {
			document.getElementById("gameStatWrapper")!.style.display = "none";
		}
		st.gameOver = false;
		gameOverFade = false;
		targetChanged = true;
		if (st.mobile) {
			hideMenuUI();
			hideUI(true);
			document.getElementById("startMenuWrapper")!.style.display = "none";
		}
		resize();
	});
	sock.on("cSrvRes", (a, d) => {
		if (d) {
			st.messages.serverCreate = `Success. Created server with IP: ${a}`;
		} else {
			st.messages.serverCreate = a;
		}
	});
	sock.on("regRes", (a, _d) => {
		st.messages.login = a;
	});
	sock.on("logRes", (a, d) => {
		if (d) {
			st.messages.login = "";
			st.playerName = a.text;
			localStorage.setItem("logKey", a.logKey);
			localStorage.setItem("userName", a.text);
			st.loggedIn = true;
			st.player.loggedIn = true;
			const user = findUserByIndex(st.player.index);
			if (user) {
				user.loggedIn = true;
			}
		} else {
			st.messages.login = a;
		}
	});
	sock.on("recovRes", (b, d) => {
		st.messages.login = b;
		if (!d) return;
		document.getElementById("recoverForm")!.style.display = "block";
		const chngPassKey = document.getElementById("chngPassKey")! as HTMLInputElement;
		const chngPassPass = document.getElementById("chngPassPass")! as HTMLInputElement;
		document.getElementById("chngPassButton")!.onclick = () => {
			st.messages.login = "Please Wait...";
			sock.emit("dbCngPass", {
				passKey: chngPassKey.value,
				newPass: chngPassPass.value,
			});
			sock.on("cngPassRes", (a, b) => {
				st.messages.login = a;
				if (b) {
					document.getElementById("recoverForm")!.style.display = "none";
				}
			});
		};
	});
	sock.on("dbClanCreateR", (a, d) => {
		if (d) {
			clanSignUp.style.display = "none";
			clanStats.style.display = "block";
			clanHeader.textContent = `[${a}] Clan:`;
			clanAdminPanel.style.display = "block";
			leaveClanButton.style.display = "inline-block";
			leaveClanButton.textContent = "DELETE CLAN";
		} else {
			st.messages.clanDB = a;
		}
	});
	sock.on("dbClanJoinR", (a, d) => {
		if (d) {
			clanSignUp.style.display = "none";
			clanStats.style.display = "block";
			clanHeader.textContent = `[${a}] Clan:`;
			st.player.account.clan = a;
			const user = findUserByIndex(st.player.index);
			if (user) {
				user.account.clan = a;
			}
			leaveClanButton.style.display = "inline-block";
			leaveClanButton.textContent = "Leave Clan";
		} else {
			st.messages.clanDB = a;
		}
	});
	sock.on("dbClanInvR", (a, _) => {
		st.messages.clanInv = a;
	});
	sock.on("dbKickInvR", (a, _) => {
		st.messages.clanInv = a;
	});
	sock.on("dbClanLevR", (a, d) => {
		if (!d) return;
		clanSignUp.style.display = "block";
		clanStats.style.display = "none";
		clanHeader.textContent = "Clans";
		st.messages.clanDB = a;
		leaveClanButton.style.display = "none";
	});
	sock.on("dbChatR", (a, d) => {
		st.messages.clanCht = a.text;
		if (!d) return;
		if (!a.newURL.match(/^https?:\/\//i)) {
			a.newURL = `http://${a.newURL}`;
		}
		clanChatLink.replaceChildren(
			<a target="_blank" href={a.newURL} rel="noopener">
				Clan Chat
			</a>,
		);
	});
	sock.on("dbChangeUserR", (a, d) => {
		if (d) {
			localStorage.setItem("userName", a);
			st.player.account.username = a;
			st.messages.editProfile = "Success. Account Updated.";
		} else {
			st.messages.editProfile = a;
		}
	});
	sock.on("dbClanStats", (clanData) => {
		st.clanData = clanData;
	});
	sock.on("updAccStat", applyAccount);
	sock.on("questData", (data) => {
		if (!data) return;
		st.quests.daily = data.daily ?? [];
		st.quests.weekly = data.weekly ?? null;
		st.quests.streak = data.streak ?? { day: 0, claimed: false, rewardLabel: "" };
		st.quests.dailyReset = data.dailyReset ?? "";
		st.quests.weeklyReset = data.weeklyReset ?? "";
	});
	sock.on("questProgressUpdate", (snapshot) => {
		if (!snapshot?.daily) return;
		// merge live progress into local quest state
		for (const live of snapshot.daily) {
			const q = st.quests.daily.find((dq) => dq.questKey === live.questKey);
			if (q) {
				q.progress = live.progress;
				q.claimable = live.claimable;
			}
		}
	});
	sock.on("questClaimResult", (result) => {
		// quest data will be pushed by the server after a successful claim
	});
	sock.on("streakComplete", () => {
		st.rewardPopup = { kind: "pendingCrates", count: st.unopenedCrateCount + 1 };
	});
	sock.on(
		"gameSetup",
		(setupJson: string, shouldSetupGameMap: boolean, shouldStartGame: boolean) => {
			const setupData = JSON.parse(setupJson);

			if (shouldSetupGameMap) {
				st.gameMap = setupData.mapData;
				st.gameMap.tiles = [];
				clutter = [];
				flags = [];
				gameWidth = st.gameMap.width;
				gameHeight = st.gameMap.height;
				mapTileScale = setupData.tileScale;
				st.players = setupData.usersInRoom;
				gameMode = st.gameMap.gameMode;
				document.getElementById("gameModeText")!.textContent =
					setupData.you.team === "blue" ? gameMode.desc2 : gameMode.desc1;
				st.currentLiked = null;
				clutter.push(...st.gameMap.clutter);
				setupMap(st.gameMap, mapTileScale, flags);
				cachedMiniMap = null;
				deactivateSprays();
				for (let i = 0; i < 100; i++) {
					const newBullet = new Projectile();
					newBullet.serverIndex = i;
					bullets.push(newBullet);
				}
			}

			if (shouldStartGame) {
				st.gameStart = true;
				showUI();
				document.getElementById("cvs")!.focus();
			}

			keys.lm = false;
			st.maxScreenHeight = setupData.maxScreenHeight * setupData.viewMult;
			st.maxScreenWidth = setupData.maxScreenWidth * setupData.viewMult;
			st.viewMult = setupData.viewMult;
			st.player = setupData.you;
			st.currentLiked = null;

			const existingPlayer = findUserByIndex(setupData.you.index);
			if (existingPlayer) {
				st.players[st.players.indexOf(existingPlayer)] = st.player;
			} else {
				st.players.push(st.player);
			}

			if (inMainMenu) {
				loadingWrapper.style.display = "none";
				inMainMenu = false;
			}

			st.startingGame = false;
			resize();
		},
	);
	sock.on("lb", updateLeaderboard);
	sock.on("ts", updateTeamScores);
	sock.on("rsd", receiveServerData);
	sock.on("upd", updateUserValue);
	sock.on("vt", updateVoteStats);
	sock.on("add", addUser);
	sock.on("updHt", (_len: number, data: Hat[]) => (st.cosmetics.hats = data));
	sock.on("updShrt", (_len: number, data: Shirt[]) => (st.cosmetics.shirts = data));
	sock.on("updCmo", (_len: number, data: Camo[][]) => (st.cosmetics.camos = data));
	sock.on("updUnlocks", (data: { hat: number[]; shirt: number[]; camo: number[] }) => {
		st.unlockedItems.hat = new Set(data.hat);
		st.unlockedItems.shirt = new Set(data.shirt);
		st.unlockedItems.camo = new Set(data.camo);
	});
	sock.on("unlockReveal", (items: { name: string; chance: number }[]) => {
		if (items.length > 0) st.rewardPopup = { kind: "unlocks", items };
	});
	sock.on("rankUp", (rank: number) => {
		st.rewardPopup = { kind: "rankUp", rank };
	});
	sock.on("crateResult", (data: { error?: string; won?: { itemName: string; chance: number } | null; remaining?: number }) => {
		if (data.error) return;
		st.unopenedCrateCount = data.remaining ?? st.unopenedCrateCount;
		st.rewardPopup = { kind: "crateOpen", won: data.won ?? null };
	});
	sock.on("crtSpr", createSpray);
	sock.on("rem", removeUser);
	sock.on("cht", messageFromServer);
	sock.on("kick", (reason: string) => {
		// a kick can arrive mid-join (e.g. "Room is full."); clear the joining
		// flag so kickPlayer isn't suppressed and the menu doesn't lock up
		st.changingLobby = false;
		kickPlayer(reason);
	});
	sock.on("1", (healthUpdate) => {
		const player = findUserByIndex(healthUpdate.gID);
		const healthDelta = healthUpdate.healthDelta;
		if (healthUpdate.gID === st.player.index && healthDelta < 0) {
			screenShake(healthDelta / 2, healthUpdate.dir);
		}
		if (
			healthUpdate.dID !== null &&
			healthUpdate.dID === st.player.index &&
			player?.onScreen &&
			healthDelta < 0
		) {
			const damage = Math.abs(healthDelta);
			startMovingAnimText(
				`${damage}`,
				player.x - player.width / 2,
				player.y - player.height,
				TeamColors.Red,
				damage / 10,
			);
		}
		if (healthUpdate.bulletIndex !== null) {
			let serverBullet = findServerBullet(healthUpdate.bulletIndex);
			if (serverBullet && serverBullet.owner?.index !== st.player.index) {
				if (player.onScreen && healthDelta < 0 && serverBullet.spriteIndex !== 2) {
					particleCone(
						12,
						player.x,
						player.y - player.height / 2 - player.jumpY,
						serverBullet.dir + Math.PI,
						Math.PI / randomInt(5, 7),
						0.5,
						16,
						0,
						true,
					);
					createLiquid(player.x, player.y, serverBullet.dir, 4);
				}
				if (serverBullet.pierceCount > 0) serverBullet.pierceCount--;
				if (serverBullet.pierceCount <= 0) serverBullet.active = false;
			}
		}
		if (player) {
			player.health = healthUpdate.health;
			if (player.index === st.player.index) {
				if (healthDelta > 0) {
					startMovingAnimText(
						`${healthDelta}`,
						player.x - player.width / 2,
						player.y - player.height,
						"#5ed951",
						healthDelta / 10,
					);
				}
				updatePlayerInfo(player);
			}
		}
	});
	sock.on("2", someoneShot);
	sock.on("jum", otherJump);
	sock.on("ex", createExplosion);
	sock.on("r", (weaponIndex: number) => {
		const player = findUserByIndex(st.player.index);
		if (player) {
			if (weaponIndex === 0 && player.weapons[weaponIndex].maxAmmo > 1) {
				showNotification("Ammo Full");
			}
			player.weapons[weaponIndex].reloadTime = 0;
			player.weapons[weaponIndex].ammo = player.weapons[weaponIndex].maxAmmo;
			window.setCooldownAnimation(weaponIndex, player.weapons[weaponIndex].reloadTime, false);
		}
	});
	sock.on("3", (event) => {
		var destPlayer = findUserByIndex(event.gID);
		var sourcePlayer = findUserByIndex(event.dID);
		destPlayer.dead = true;
		if (event.kB && event.gID !== st.player.index) {
			if (event.dID === st.player.index) {
				startBigAnimText(
					"BOSS SLAIN",
					`${event.sS} POINTS`,
					2000,
					true,
					"#ffffff",
					TeamColors.Blue,
					true,
					1.25,
				);
			} else {
				showNotification(`${sourcePlayer.name} slayed the boss`);
			}
		} else if (event.dID === st.player.index && event.gID !== st.player.index) {
			playSound("kill1", sourcePlayer.x, sourcePlayer.y);
			let killMsg = "";
			if (destPlayer.team !== sourcePlayer.team) {
				event.sS = `+${event.sS}`;
				killMsg =
					event.kd <= 1 || event.kd === undefined
						? "Enemy Killed"
						: event.kd === 2
							? "Double Kill"
							: event.kd === 3
								? "Triple Kill"
								: event.kd === 4
									? "Multi Kill"
									: event.kd === 5
										? "Ultra Kill"
										: event.kd === 6
											? "No Way!"
											: event.kd === 7
												? "Stop!"
												: "Godlike!";
			} else {
				killMsg = "Team Kill";
				event.sS = "no";
			}
			if (event.ast) {
				killMsg = "Kill Assist";
			}
			startBigAnimText(
				killMsg,
				`${event.sS} POINTS`,
				2000,
				true,
				"#ffffff",
				TeamColors.Blue,
				true,
				1.25,
			);
		}
		if (event.gID === st.player.index) {
			hideStatTable();
			st.gameStart = false;
			hideUI(false);
			st.player.dead = true;
			window.setTimeout(() => {
				if (!st.gameOver) {
					document.getElementById("startMenuWrapper")!.style.display = "flex";
					document.getElementById("linkBoxRight")!.style.display = "block";
				}
			}, 1300);
			playSound("death1", st.player.x, st.player.y);
			startSoundTrack(1);
		}
	});
	sock.on("4", (cData: ClutterObject, index: number, type: number) => {
		if (type === 0) {
			if (st.gameMap != null && cData.active !== undefined) {
				st.gameMap.pickups[index].active = cData.active;
			}
		} else if (clutter[index]) {
			let clt = clutter[index];
			if (cData.active !== undefined) {
				clt.active = cData.active;
			}
			if (cData.x !== undefined) {
				clt.x = cData.x;
			}
			if (cData.y !== undefined) {
				clt.y = cData.y;
			}
		}
	});
	sock.on("tprt", (zoneEvent: ZoneEvent) => {
		const user = findUserByIndex(zoneEvent.indx);
		if (!user) return;
		user.x = zoneEvent.newX!;
		user.y = zoneEvent.newY!;
		createSmokePuff(user.x, user.y, 5, false, 1);
		if (zoneEvent.indx === st.player.index) {
			st.player.x = zoneEvent.newX!;
			st.player.y = zoneEvent.newY!;
			startBigAnimText(
				"ZONE ENTERED",
				`+${zoneEvent.score} POINTS`,
				2000,
				true,
				"#ffffff",
				TeamColors.Blue,
				true,
				1.3,
			);
		} else {
			//@ts-expect-error TODO
			createSmokePuff(zoneEvent.oldX, zoneEvent.oldY, 5, false, 1);
			showNotification(`${user.name} scored`);
		}
	});
	sock.on("5", (text: string) => {
		showNotification(text);
	});
	sock.on("6", (text: string, secondaryText: string, fontSizeMult: number) => {
		if (!st.player.dead) {
			startBigAnimText(
				text,
				secondaryText,
				2000,
				true,
				"#ffffff",
				TeamColors.Blue,
				true,
				fontSizeMult,
			);
		}
	});
	sock.on("7", (winner: string, modeVoteData, isFading: boolean) => {
		st.gameOver = true;
		document.getElementById("startMenuWrapper")!.style.display = "none";
		showStatTable(modeVoteData, winner, false, isFading);
		startSoundTrack(1);
	});
	sock.on("8", (timeLeft: number) => {
		document.getElementById("nextGameTimer")!.textContent = `${timeLeft}: UNTIL NEXT ROUND`;
	});
}

function setupInitialSocket(sock: Socket) {
	// Session cookie handles reconnection automatically via server middleware.
	// The server validates the cookie and emits updAccStat if valid.
	// No client-side reconnection logic needed.
}

function updateVoteStats(a: any) {
	document.getElementById(`votesText${a.i}`)!.textContent = `${a.n}: ${a.v}`;
}
function showESCMenu() {
	deactiveAllAnimTexts();
	st.startingGame = false;
	inMainMenu = true;
	hideUI(false);
	document.getElementById("startMenuWrapper")!.style.display = "flex";
	document.getElementById("gameStatWrapper")!.style.display = "none";
}

function showStatTable(
	modeVoteData: any,
	winner: string | number | null,
	reset: boolean,
	isFading: boolean,
) {
	hideUI(false);

	if (reset) {
		document.getElementById("nextGameTimer")!.textContent = "GAME STATS";
		document.getElementById("winningTeamText")!.textContent = "";
		document.getElementById("voteModeContainer")!.textContent = "";
	} else {
		let isWinner = st.player.team === winner || st.player.id === winner;
		if (!isFading) {
			if (isWinner) {
				startBigAnimText(
					"Victory",
					"Well Played!",
					2500,
					true,
					TeamColors.Blue,
					"#ffffff",
					false,
					2,
				);
				document.getElementById("winningTeamText")!.textContent = "VICTORY";
				document.getElementById("winningTeamText")!.style.color = TeamColors.Blue;
			} else if (st.player.team.length) {
				startBigAnimText("Defeat", "Bad Luck!", 2500, true, TeamColors.Red, "#ffffff", false, 2);
				document.getElementById("winningTeamText")!.textContent = "DEFEAT";
				document.getElementById("winningTeamText")!.style.color = TeamColors.Red;
			}
		}
		if (modeVoteData != null) {
			document.getElementById("voteModeContainer")!.textContent = "";
			for (let i = 0; i < modeVoteData.length; ++i) {
				let modeVoteBtn = document.createElement("button");
				modeVoteBtn.className = "modeVoteButton";
				modeVoteBtn.setAttribute("id", `votesText${i}`);
				modeVoteBtn.textContent = `${modeVoteData[i].name}: ${modeVoteData[i].votes}`;
				document.getElementById("voteModeContainer")!.appendChild(modeVoteBtn);
				modeVoteBtn.onclick = () => {
					mainCanvas.focus();
					socket.emit("modeVote", i);
					for (let j = 0; j < modeVoteData.length; ++j) {
						if (
							i === j &&
							document.getElementById(`votesText${j}`)!.className === "modeVoteButton"
						) {
							document.getElementById(`votesText${j}`)!.className = "modeVoteButtonA";
						} else {
							document.getElementById(`votesText${j}`)!.className = "modeVoteButton";
						}
					}
				};
			}
		}
	}

	if (isFading) {
		overlayAlpha = overlayMaxAlpha;
		animateOverlay = false;
		gameOverFade = true;
		deactiveAllAnimTexts();
		document.getElementById("gameStatWrapper")!.style.display = "block";
	} else {
		hideStatTable();
		hideUI(false);
		animateOverlay = true;
		window.setTimeout(() => {
			gameOverFade = true;
		}, 2500);
		window.setTimeout(() => {
			document.getElementById("gameStatWrapper")!.style.display = "block";
		}, 4500);
	}
}
function hideStatTable() {
	showUI();
	overlayAlpha = 0;
	showingScoreBoard = false;
	animateOverlay = true;
	drawOverlay(graph, false, true);
	document.getElementById("gameStatWrapper")!.style.display = "none";
	document.getElementById("linkBoxRight")!.style.display = "none";
}

function addUser(userString: string) {
	let parsed = JSON.parse(userString);
	if (parsed.index !== st.player.index) {
		const existingUser = findUserByIndex(parsed.index);
		if (existingUser == null) {
			st.players.push(parsed);
		} else {
			st.players[st.players.indexOf(existingUser)] = parsed;
		}
	}
}
function removeUser(userIndex: number) {
	if (userIndex !== st.player.index) {
		let tmpUser = findUserByIndex(userIndex);
		if (tmpUser != null) {
			st.players.splice(st.players.indexOf(tmpUser), 1);
		}
	}
}
function updateUserValue(data: any) {
	const tmpUser = findUserByIndex(data.i);
	if (!tmpUser) {
		fetchUserWithIndex(data.i);
		return;
	}
	if (data.s !== undefined) {
		tmpUser.score = data.s;
	}
	if (data.sp !== undefined) {
		tmpUser.isSpawnProtected = data.sp;
	}
	if (data.wi !== undefined && data.i !== st.player.index) {
		playerEquipWeapon(tmpUser, data.wi);
	}
	if (data.l !== undefined) {
		tmpUser.likedBy = data.l;
	}
	if (data.dea !== undefined) {
		tmpUser.deaths = data.dea;
	}
	if (data.kil !== undefined) {
		tmpUser.kills = data.kil;
	}
	if (data.dmg !== undefined) {
		tmpUser.totalDamage = data.dmg;
	}
	if (data.hea !== undefined) {
		tmpUser.totalHealing = data.hea;
	}
	if (data.goa !== undefined) {
		tmpUser.totalGoals = data.goa;
	}
	if (tmpUser.index === st.player.index) {
		updatePlayerInfo(tmpUser);
	}
}
function fetchUserWithIndex(index: number) {
	socket.emit("ftc", index);
}
function receiveServerData(data: number[]) {
	if (!st.gameOver) {
		st.players.forEach((obj) => {
			obj.onScreen = false;
		});
		for (let cursor = 0; cursor < data.length; ) {
			const packetLength = data[0 + cursor];
			const playerIndex = data[1 + cursor];
			const tmpUser = findUserByIndex(playerIndex);
			if (playerIndex === st.player.index && tmpUser != null) {
				if (packetLength > 2) {
					tmpUser.x = data[2 + cursor];
				}
				if (packetLength > 3) {
					tmpUser.y = data[3 + cursor];
				}
				if (packetLength > 4) {
					tmpUser.angle = data[4 + cursor];
				}
				if (packetLength > 5) {
					tmpUser.isn = data[5 + cursor];
				}
				tmpUser.onScreen = true;
			} else if (tmpUser != null) {
				if (packetLength > 2) {
					tmpUser.xSpeed = Math.abs(tmpUser.x - data[2 + cursor]);
					tmpUser.x = data[2 + cursor];
				}
				if (packetLength > 3) {
					tmpUser.ySpeed = Math.abs(tmpUser.y - data[3 + cursor]);
					tmpUser.y = data[3 + cursor];
				}
				if (packetLength > 4) {
					tmpUser.angle = data[4 + cursor];
				}
				const currentWeapon = getCurrentWeapon(tmpUser);
				if (currentWeapon) {
					currentWeapon.front = isWeaponFacingFront(snapAngleToCardinal(tmpUser.angle));
				}
				if (packetLength > 5) {
					tmpUser.nameYOffset = data[5 + cursor];
				}
				tmpUser.onScreen = true;
			} else {
				fetchUserWithIndex(playerIndex);
			}
			cursor += packetLength;
		}
	}
	for (const plr of st.players) {
		if (plr.index !== st.player.index) continue;
		if (plr.dead || st.gameOver || thisInput.length > 80) {
			thisInput = [];
		}
		if (plr.dead) continue;
		let inputCursor = 0;
		while (inputCursor < thisInput.length) {
			if (thisInput[inputCursor].isn <= plr.isn!) {
				thisInput.splice(inputCursor, 1);
				continue;
			}
			let horizontalDelta = thisInput[inputCursor].hdt;
			let verticalDelta = thisInput[inputCursor].vdt;
			const inputMagnitude = Math.sqrt(
				thisInput[inputCursor].hdt * thisInput[inputCursor].hdt +
					thisInput[inputCursor].vdt * thisInput[inputCursor].vdt,
			);
			if (inputMagnitude !== 0) {
				horizontalDelta /= inputMagnitude;
				verticalDelta /= inputMagnitude;
			}
			plr.oldX = plr.x;
			plr.oldY = plr.y;
			plr.x += horizontalDelta * plr.speed * thisInput[inputCursor].delta;
			plr.y += verticalDelta * plr.speed * thisInput[inputCursor].delta;
			wallCol(plr, st.gameMap.tiles, clutter);
			inputCursor++;
		}
		plr.x = Math.round(plr.x);
		plr.y = Math.round(plr.y);
		updatePlayerInfo(plr);
	}
}
function updatePlayerInfo(data: Partial<Player>) {
	st.player.x = data.x!;
	st.player.y = data.y!;
	st.player.dead = data.dead!;
	if (st.player.score < data.score!) {
		playSound("score", st.player.x, st.player.y);
	}
	st.player.score = data.score!;
	st.player.health = data.health!;
}
function findUserByIndex(index: number): Player {
	return st.players.find((obj) => obj.index === index) ?? null!;
}

function sortUsersByPosition(a: Player, b: Player) {
	if (a.y < b.y) {
		return -1;
	} else if (a.y > b.y) {
		return 1;
	} else {
		return 0;
	}
}

function updateLeaderboard(data: number[]) {
	let test: Node[] = [];
	test.push(<span class="title">LEADERBOARD</span>);

	for (let i = 0; i < data.length; i++) {
		let tmpPlayer = findUserByIndex(data[0 + i]);
		if (tmpPlayer == null) continue;
		test.push(<br />);
		if (tmpPlayer.index === st.player.index) {
			test.push(
				<span class="me">
					{i + 1}. {st.player.name}
					{st.player.account.clan && ` [${st.player.account.clan}]`}
				</span>,
			);
		} else if (tmpPlayer.name) {
			test.push(
				<>
					<span class={tmpPlayer.team !== st.player.team ? "red" : "blue"}>
						{i + 1}. {tmpPlayer.name}
					</span>
					{tmpPlayer.account.clan && <span class="me"> [{tmpPlayer.account.clan}]</span>}
				</>,
			);
		}
	}
	document.getElementById("status")!.replaceChildren(...test);
}
function updateTeamScores(scoreRed: number, scoreBlue: number) {
	var redProgress = document.getElementById("redProgress")!;
	var blueText = document.getElementById("blueText")!;
	var blueProgress = document.getElementById("blueProgress")!;
	var redProgCont = document.getElementById("redProgCont")!;
	if (!gameMode) return;
	if (gameMode.teams) {
		blueText.textContent = "A";
		redProgCont.style.display = "";
		if (st.player.team === "red") {
			redProgress.setAttribute("style", `display:block;width:${scoreBlue}%`);
			redProgress.style.width = `${scoreBlue}%`;
			blueProgress.setAttribute("style", `display:block;width:${scoreRed}%`);
			blueProgress.style.width = `${scoreRed}%`;
		} else {
			redProgress.setAttribute("style", `display:block;width:${scoreRed}%`);
			redProgress.style.width = `${scoreRed}%`;
			blueProgress.setAttribute("style", `display:block;width:${scoreBlue}%`);
			blueProgress.style.width = `${scoreBlue}%`;
		}
	} else {
		//scoreBlue = Math.round((st.player.score / scoreRed) * 100);
		scoreBlue = (st.player.score / gameMode.score) * 100;
		blueProgress.setAttribute("style", `display:block;width:${scoreBlue}%`);
		blueProgress.style.width = `${scoreBlue}%`;
		blueText.textContent = "YOU";
		redProgCont.style.display = "none";
	}
}
function showUI() {
	if (st.settings.showUI) {
		document.getElementById("status")!.style.display = "block";
		document.getElementById("statContainer2")!.style.display = "block";
		document.getElementById("actionBar")!.style.display = "block";
		document.getElementById("statContainer")!.style.display = "block";
		document.getElementById("score")!.style.display = "block";
		if (st.settings.showPINGFPS) {
			document.getElementById("conStatContainer")!.style.display = "block";
		}
		if (!st.settings.showLeader) {
			document.getElementById("status")!.style.display = "none";
		}
	}
	if (st.settings.showChat) {
		document.getElementById("chatbox")!.style.display = "block";
	}
}
function hideMenuUI() {
	document.getElementById("linkBoxRight")!.style.display = "none";
}
function hideUI(hideChatbox: boolean) {
	document.getElementById("status")!.style.display = "none";
	document.getElementById("statContainer2")!.style.display = "none";
	document.getElementById("actionBar")!.style.display = "none";
	document.getElementById("conStatContainer")!.style.display = "none";
	document.getElementById("score")!.style.display = "none";
	document.getElementById("statContainer")!.style.display = "none";
	if (hideChatbox) {
		document.getElementById("chatbox")!.style.display = "none";
	}
}
// window.addEventListener("focus", () => {
// 	socket?.emit("5", 1);
// 	tabbed = 0;
// });
// window.addEventListener("blur", () => {
// 	socket?.emit("5", 0);
// 	tabbed = 1;
// });
let currentFPS = 0;
let fpsUpdateDelta = 0;
let fpsSamples: number[] = [];
function updateGameLoop() {
	delta = currentTime - oldTime;

	currentFPS = delta ? 1000 / delta : 0;
	fpsSamples.push(currentFPS);

	fpsUpdateDelta += delta;
	if (fpsUpdateDelta >= 1000) {
		const average = fpsSamples.reduce((a, b) => a + b) / fpsSamples.length;
		document.getElementById("fpsText")!.textContent = `FPS ${Math.round(average)}`;
		fpsUpdateDelta = 0;
		fpsSamples = [];
	}
	oldTime = currentTime;
	let horizontalDT = 0;
	let verticalDT = 0;
	var doJump = 0;
	if (keys.u) {
		verticalDT = -1;
	}
	if (keys.d) {
		verticalDT = 1;
	}
	if (keys.r) {
		horizontalDT = 1;
	}
	if (keys.l) {
		horizontalDT = -1;
	}
	if (keys.s) {
		doJump = 0;
	}
	var b = horizontalDT;
	var d = verticalDT;
	var e = Math.sqrt(horizontalDT * horizontalDT + verticalDT * verticalDT);
	if (e !== 0) {
		b /= e;
		d /= e;
	}
	const clientPrediction = true;
	if (clientPrediction) {
		for (const plr of st.players) {
			if (plr.index === st.player.index) {
				plr.oldX = plr.x;
				plr.oldY = plr.y;
				if (!plr.dead && !st.gameOver) {
					plr.x += b * plr.speed * delta;
					plr.y += d * plr.speed * delta;
				}
				wallCol(plr, st.gameMap.tiles, clutter);
				plr.x = Math.round(plr.x);
				plr.y = Math.round(plr.y);
				plr.angle = ((target.f + Math.PI * 2) % (Math.PI * 2)) * (180 / Math.PI) + 90;
				const currentWeapon = getCurrentWeapon(plr);
				if (currentWeapon) {
					currentWeapon.front = isWeaponFacingFront(snapAngleToCardinal(plr.angle));
				}
				if (plr.jumpCountdown > 0) {
					plr.jumpCountdown -= delta;
				}
				if (keys.s && plr.jumpCountdown <= 0 && !st.gameOver) {
					playerJump(plr);
					doJump = 1;
				}
			}
			if (plr.jumpY !== 0) {
				plr.jumpDelta -= plr.gravityStrength * delta;
				plr.jumpY += plr.jumpDelta * delta;
				if (plr.jumpY > 0) {
					plr.animIndex = 1;
				} else {
					plr.jumpY = 0;
					plr.jumpDelta = 0;
					plr.jumpCountdown = 250;
				}
				plr.jumpY = Math.round(plr.jumpY);
			}
			if (plr.index === st.player.index && !st.gameOver) {
				let sendData = {
					hdt: b,
					vdt: d,
					ts: currentTime,
					isn: inputNumber,
					s: doJump,
					delta,
				};
				inputNumber++;
				thisInput.push(sendData);
				socket.emit("4", sendData);
				if (userScroll !== 0 && !st.gameOver) {
					playerSwapWeapon(plr, userScroll);
					userScroll = 0;
				}
				if (keys.rl && !st.gameOver) {
					playerReload(plr, true);
				}
				if (keys.lm && !st.gameOver && st.player.weapons.length > 0) {
					const weapon = getCurrentWeapon(plr);
					if (weapon && currentTime - weapon.lastShot >= weapon.fireRate) {
						shootBullet(plr);
					}
				}
			}
			if (st.gameOver) {
				plr.animIndex = 0;
			} else {
				let movementDelta = Math.abs(b) + Math.abs(d);
				if (plr.index !== st.player.index) {
					movementDelta = Math.abs(plr.xSpeed!) + Math.abs(plr.ySpeed!);
				}
				if (movementDelta > 0) {
					plr.frameCountdown -= delta / 4;
					if (plr.frameCountdown <= 0) {
						plr.animIndex++;
						if (plr.jumpY === 0 && plr.onScreen && !plr.dead) {
							stillDustParticle(plr.x, plr.y, false);
						}
						if (plr.animIndex >= 3) {
							plr.animIndex = 1;
						} else if (plr.animIndex === 2 && plr.jumpY <= 0) {
							playSound("step1", plr.x, plr.y);
						}
						plr.frameCountdown = 40;
					}
				} else if (plr.animIndex !== 0) {
					plr.animIndex = 0;
				}
				if (plr.jumpY > 0) {
					plr.animIndex = 1;
				}
			}
		}
	}
	st.players.sort(sortUsersByPosition);
	if (!st.kicked) {
		if (st.gameOver) {
			doGame(delta);
			if (gameOverFade && st.settings.showFade) {
				drawOverlay(graph, true, false);
			}
		} else if (st.player.dead && !inMainMenu) {
			doGame(delta);
			drawOverlay(graph, true, false);
		} else if (st.gameStart) {
			doGame(delta);
			drawOverlay(graph, false, true);
			if (!st.mobile && targetChanged) {
				targetChanged = false;
				socket.emit("0", target.f);
			}
		} else if (!st.kicked) {
			drawMenuBackground();
			drawOverlay(graph, false, false);
		}
	}
	if (disconnected || st.kicked) {
		drawOverlay(graph, false, false);
		const renderedReason = st.kicked
			? reason
				? renderShadedAnimText(reason, st.viewMult * 48, "#ffffff", 6, "")
				: renderShadedAnimText("You were kicked", st.viewMult * 48, "#ffffff", 6, "")
			: renderShadedAnimText("Disconnected", st.viewMult * 48, "#ffffff", 6, "");
		graph.drawImage(
			renderedReason,
			st.maxScreenWidth / 2 - renderedReason.width / 2,
			st.maxScreenHeight / 2 - renderedReason.height / 2,
			renderedReason.width,
			renderedReason.height,
		);
	}
	if (st.settings.showTrippy) {
		graph.globalAlpha = 0.25;
	}
}
function otherJump(userIdx: number) {
	var tmpPlayer = findUserByIndex(userIdx);
	if (tmpPlayer && st.player.index !== userIdx) {
		playerJump(tmpPlayer);
	}
}
function playerJump(plr: Player) {
	if (plr.jumpY <= 0) {
		playSound("jump1", plr.x, plr.y);
		plr.jumpDelta = plr.jumpStrength;
		plr.jumpY = plr.jumpDelta;
	}
}
const overlayMaxAlpha = 0.5;
var overlayAlpha = overlayMaxAlpha;
const overlayFadeUp = 0.01;
const overlayFadeDown = 0.04;
var animateOverlay = true;
function drawOverlay(ctx: CanvasRenderingContext2D, fadeUp: boolean, fadeDown: boolean) {
	if (animateOverlay) {
		if (fadeUp) {
			overlayAlpha += overlayFadeUp;
			if (overlayAlpha >= overlayMaxAlpha) {
				overlayAlpha = overlayMaxAlpha;
			}
		} else if (fadeDown) {
			overlayAlpha -= overlayFadeDown;
			if (overlayAlpha <= 0) {
				overlayAlpha = 0;
			}
		} else {
			overlayAlpha = overlayMaxAlpha;
		}
	}
	if (overlayAlpha > 0) {
		ctx.fillStyle = "#2e3031";
		ctx.globalAlpha = overlayAlpha;
		ctx.fillRect(0, 0, st.maxScreenWidth, st.maxScreenHeight);
		ctx.globalAlpha = 1;
	}
}
var drawMiniMapFPS = 4;
var drawMiniMapCounter = 0;
function doGame(delta: number) {
	updateScreenShake(/*delta*/);
	if (target != null) {
		st.startX =
			st.player.x -
			st.maxScreenWidth / 2 +
			-st.shake.x +
			target.dOffset * Math.cos(target.f + Math.PI);

		st.startY =
			st.player.y -
			20 -
			st.maxScreenHeight / 2 +
			-st.shake.y +
			target.dOffset * Math.sin(target.f + Math.PI);

		if (fillCounter > 1 && socket) {
			socket.emit("kil");
		}
	}
	drawBackground();
	drawMap(0);
	updateBulletsAndDrawTrails(delta);
	drawMap(1);
	drawSprays();
	updateParticles(delta, 0);
	drawGameObjects(delta);
	drawBullets();
	updateParticles(delta, 1);
	drawMap(2);
	drawPlayerNames();
	drawEdgeShader();
	drawGameLights(delta);
	updateAnimTexts(delta);
	updateNotifications(delta);
	drawUI();
	drawMiniMapCounter--;
	if (drawMiniMapCounter <= 0 && st.gameStart) {
		fillCounter = 0;
		drawMiniMapCounter = drawMiniMapFPS;
		drawMiniMap();
	}
}
window.addEventListener("resize", resize);
function resize() {
	calculateUIScale();
	var a = Math.max(window.innerWidth / st.maxScreenWidth, window.innerHeight / st.maxScreenHeight);
	mainCanvas.width = window.innerWidth;
	mainCanvas.height = window.innerHeight;
	graph.setTransform(
		a,
		0,
		0,
		a,
		(window.innerWidth - st.maxScreenWidth * a) / 2,
		(window.innerHeight - st.maxScreenHeight * a) / 2,
	);
	// startMenuWrapper is a responsive full-screen flex overlay now — no JS scaling
	document.getElementById("gameStatWrapper")!.style.transform =
		`perspective(1px) translate(-50%, -50%) scale(${uiScale})`;
	graph.imageSmoothingEnabled = false;
	drawMenuBackground();
}
resize();
var grd: CanvasGradient | null = null;
function drawEdgeShader() {
	if (!graph) return;
	if (grd == null) {
		grd = graph.createRadialGradient(
			st.player.x - st.startX,
			st.player.y - st.startY,
			0,
			st.player.x - st.startX,
			st.player.y - st.startY,
			st.maxScreenWidth / 2,
		);
		grd.addColorStop(0, "rgba(0,0,0,0.0)");
		grd.addColorStop(1, "rgba(0,0,0,0.4");
	}
	graph.fillStyle = grd;
	graph.fillRect(0, 0, st.maxScreenWidth, st.maxScreenHeight);
}

function drawGameLights(delta: number) {
	if (!st.sprites.light || !graph) return;
	graph.globalCompositeOperation = "lighter";
	graph.globalAlpha = 0.2;
	if (st.settings.showGlows) {
		for (const tmpObject of bullets) {
			if (!tmpObject.active || tmpObject.spriteIndex === 2) continue;
			let tmpBulletGlowWidth = tmpObject.glowWidth || Math.min(200, tmpObject.width * 14);
			let tmpBulletGlowHeight = tmpObject.glowHeight || tmpObject.height * 2.5;
			let lightX = tmpObject.x - st.startX;
			let lightY = tmpObject.y - st.startY;
			if (!canSee(lightX, lightY, tmpBulletGlowWidth, tmpBulletGlowHeight)) continue;
			graph.save();
			graph.translate(lightX, lightY);
			drawSprite(
				graph,
				st.sprites.light,
				-(tmpBulletGlowWidth / 2),
				-(tmpBulletGlowHeight / 2) + tmpObject.height / 2,
				tmpBulletGlowWidth,
				tmpBulletGlowHeight,
				tmpObject.dir - Math.PI / 2,
				false,
				0,
				0,
				0,
			);
			graph.restore();
		}
		graph.globalAlpha = 0.2;
		updateFlashGlows(delta);
	}
	graph.globalCompositeOperation = "source-over";
}
var mapScale = mapCanvas.width;
var pingScale = mapScale / 80;
mapContext.lineWidth = pingScale / 2;

var cachedMiniMap: HTMLCanvasElement | null = null;
function getCachedMiniMap() {
	fillCounter++;
	if (cachedMiniMap == null && st.gameMap?.tiles.length > 0) {
		let baseCanvasElem = document.createElement("canvas");
		let baseCtx = baseCanvasElem.getContext("2d")!;
		baseCanvasElem.width = mapScale;
		baseCanvasElem.height = mapScale;
		baseCtx.fillStyle = "#fff";
		for (const tile of st.gameMap.tiles) {
			if (!tile.wall) continue;
			baseCtx.fillRect(
				(tile.x / gameWidth) * mapScale,
				(tile.y / gameHeight) * mapScale,
				((mapTileScale * 1.08) / gameWidth) * mapScale,
				((mapTileScale * 1.08) / gameWidth) * mapScale,
			);
		}
		let finalCanvasElem = document.createElement("canvas");
		let finalCtx = finalCanvasElem.getContext("2d")!;
		finalCanvasElem.width = mapScale;
		finalCanvasElem.height = mapScale;
		finalCtx.globalAlpha = 0.1;
		finalCtx.drawImage(baseCanvasElem, 0, 0);
		finalCtx.globalAlpha = 1;
		for (const tile of st.gameMap.tiles) {
			if (!tile.hardPoint) continue;
			finalCtx.fillStyle = tile.objTeam === st.player.team ? TeamColors.Blue : TeamColors.Red;
			finalCtx.fillRect(
				(tile.x / gameWidth) * mapScale,
				(tile.y / gameHeight) * mapScale,
				((mapTileScale * 1.08) / gameWidth) * mapScale,
				((mapTileScale * 1.08) / gameWidth) * mapScale,
			);
		}
		cachedMiniMap = finalCanvasElem;
	}
	return cachedMiniMap;
}
function drawMiniMap() {
	mapContext.reset(); // I had to add this - the minimap 'caching' system seems weird
	var cachedMiniMap = getCachedMiniMap();
	if (cachedMiniMap != null) {
		mapContext.drawImage(cachedMiniMap, 0, 0, mapScale, mapScale);
	}
	mapContext.globalAlpha = 1;
	for (const plr of st.players) {
		if (
			!plr.dead &&
			plr.onScreen &&
			(plr.index === st.player.index || plr.team === st.player.team || plr.isBoss)
		) {
			mapContext.fillStyle =
				plr.index === st.player.index ? "#fff" : plr.isBoss ? "#db4fcd" : TeamColors.Blue;
			mapContext.beginPath();
			mapContext.arc(
				(plr.x / gameWidth) * mapScale,
				(plr.y / gameHeight) * mapScale,
				pingScale,
				0,
				Math.PI * 2,
				true,
			);
			mapContext.closePath();
			mapContext.fill();
		}
	}
	if (!st.gameMap) return;
	mapContext.globalAlpha = 1;
	for (const pickup of st.gameMap.pickups) {
		if (!pickup.active) continue;
		if (pickup.type === "lootcrate") {
			mapContext.fillStyle = "#ffd100";
		} else if (pickup.type === "healthpack") {
			mapContext.fillStyle = "#5ed951";
		}
		mapContext.beginPath();
		mapContext.arc(
			(pickup.x / gameWidth) * mapScale,
			(pickup.y / gameHeight) * mapScale,
			pingScale,
			0,
			Math.PI * 2,
			true,
		);
		mapContext.closePath();
		mapContext.fill();
	}
}
function calculateUIScale() {
	uiScale = ((window.innerHeight + window.innerWidth) / (1920 + 1080)) * 1.25;
}
function drawMenuBackground() {}
function drawUI() {}
var userSprays: Sprite[] = [];
var cachedSprays: Record<string, SpriteCanvas> = {};
function createSpray(plrIdx: number, x: number, y: number) {
	let tmpPlayer = findUserByIndex(plrIdx);
	if (!tmpPlayer) return;
	let tmpSpray = userSprays.find((s) => s.owner === plrIdx);
	if (!tmpSpray) {
		const img = new Image() as Sprite;
		img.owner = plrIdx;
		img.active = false;
		img.xPos = 0;
		img.yPos = 0;
		img.onload = () => {
			cacheSpray(img);
		};
		userSprays.push(img);
		tmpSpray = img;
	}
	tmpSpray.active = true;
	tmpSpray.scale = tmpPlayer.spray.info.scale;
	tmpSpray.alpha = tmpPlayer.spray.info.alpha;
	tmpSpray.resolution = tmpPlayer.spray.info.resolution;
	tmpSpray.xPos = x - tmpSpray.scale! / 2;
	tmpSpray.yPos = y - tmpSpray.scale! / 2;
	if (tmpSpray.src !== tmpPlayer.spray.src) {
		tmpSpray.src = tmpPlayer.spray.src;
	}
}
function sendSpray() {
	socket.emit("crtSpr");
}
function deactivateSprays() {
	userSprays.forEach((spray) => {
		spray.active = false;
	});
}
function cacheSpray(img: Sprite) {
	const tmpIndex = `${img.src}`;
	let tmpSpray = cachedSprays[tmpIndex];
	if (tmpSpray || img.width === 0) return;

	let initialCanvas = document.createElement("canvas");
	let initialCtx = initialCanvas.getContext("2d")!;
	initialCanvas.width = img.resolution!;
	initialCanvas.height = img.resolution!;
	initialCtx.drawImage(img, 0, 0, img.resolution!, img.resolution!);
	let finalCanvas = document.createElement("canvas");
	let finalCtx = finalCanvas.getContext("2d")!;
	finalCanvas.width = img.scale!;
	finalCanvas.height = img.scale!;
	finalCtx.imageSmoothingEnabled = false;
	finalCtx.globalAlpha = img.alpha!;
	finalCtx.drawImage(initialCanvas, 0, 0, img.scale!, img.scale!);
	tmpSpray = finalCanvas;
	cachedSprays[tmpIndex] = tmpSpray;
}
function drawSprays() {
	if (!st.settings.showSprays) return;
	for (const sp of userSprays) {
		if (!sp.active) continue;
		let tmpSpray = cachedSprays[`${sp.src}`];
		if (!tmpSpray) continue;
		graph.drawImage(tmpSpray, sp.xPos! - st.startX, sp.yPos! - st.startY);
	}
}
var spriteIndex = 0;
function getSprite(fileName: string) {
	var b = new Image() as Sprite;
	b.index = spriteIndex;
	b.flipped = false;
	b.isLoaded = false;
	b.onload = () => {
		b.isLoaded = true;
		b.onload = null;
	};
	b.onerror = () => {
		b.isLoaded = false;
		console.error(`File not Found: ${fileName}.png`);
	};
	let tmpPicture = localStorage.getItem(`${fileName}.png`);
	b.src = tmpPicture ? tmpPicture : "";
	b.crossOrigin = "anonymous";

	spriteIndex++;
	return b;
}
function flipSprite(sprite: Sprite, horizontal: boolean): Sprite {
	let canvasElem = document.createElement("canvas") as any; // todo cursed
	let ctx = canvasElem.getContext("2d");
	canvasElem.width = sprite.width;
	canvasElem.height = sprite.height;
	ctx.imageSmoothingEnabled = false;
	if (horizontal) {
		ctx.scale(-1, 1);
		ctx.drawImage(sprite, -canvasElem.width, 0, canvasElem.width, canvasElem.height);
	} else {
		ctx.scale(1, -1);
		ctx.drawImage(sprite, 0, -canvasElem.height, canvasElem.width, canvasElem.height);
	}
	canvasElem.index = sprite.index;
	canvasElem.flipped = true;
	canvasElem.isLoaded = true;
	return canvasElem;
}
function playerSwapWeapon(tmpPlayer: Player, change: number) {
	if (!tmpPlayer || tmpPlayer.dead) return;
	tmpPlayer.currentWeapon += change;
	if (tmpPlayer.currentWeapon < 0) {
		tmpPlayer.currentWeapon = tmpPlayer.weapons.length - 1;
	}
	if (tmpPlayer.currentWeapon >= tmpPlayer.weapons.length) {
		tmpPlayer.currentWeapon = 0;
	}
	playerEquipWeapon(tmpPlayer, tmpPlayer.currentWeapon);
	socket.emit("sw", tmpPlayer.currentWeapon);
}
function playerEquipWeapon(tmpPlayer: Player, weaponId: number) {
	const previousWeapon = tmpPlayer.currentWeapon;
	if (previousWeapon !== weaponId) {
		window.resetCooldownAnimation?.(previousWeapon);
		window.setCooldownAnimation?.(previousWeapon, 0, false);
	}
	tmpPlayer.currentWeapon = weaponId;
	window.resetCooldownAnimation?.(weaponId);
	window.setCooldownAnimation?.(weaponId, 0, false);
}
function shootBullet(source: Player) {
	const sourceWep = getCurrentWeapon(source);
	if (
		source.dead ||
		!sourceWep ||
		source.isSpawnProtected ||
		sourceWep.weaponIndex < 0 ||
		sourceWep.reloadTime > 0 ||
		sourceWep.ammo <= 0
	)
		return;

	screenShake(sourceWep.shake, target.f);
	for (let b = 0; b < sourceWep.bulletsPerShot; ++b) {
		sourceWep.spreadIndex++;
		if (sourceWep.spreadIndex >= sourceWep.spread.length) {
			sourceWep.spreadIndex = 0; // ???
		}
		let spread = sourceWep.spread[sourceWep.spreadIndex];
		spread = utils.roundNumber(target.f + Math.PI + spread, 2);
		const muzzleDistance = sourceWep.holdDist + sourceWep.bDist;
		const spawnX = Math.round(source.x + muzzleDistance * Math.cos(spread));
		const spawnY = Math.round(
			source.y - sourceWep.yOffset - source.jumpY + muzzleDistance * Math.sin(spread),
		);
		const nextBullet = getNextBullet(bullets);
		shootNextBullet(
			{
				x: spawnX,
				y: spawnY,
				d: spread,
				si: nextBullet.serverIndex,
			},
			source,
			target.d,
			currentTime,
			nextBullet,
		);
	}
	socket.emit("1", source.x, source.y, source.jumpY, target.f, target.d, currentTime);
	sourceWep.lastShot = currentTime;
	sourceWep.ammo--;
	if (sourceWep.ammo <= 0) {
		playerReload(source, true);
	}
}
function playerReload(player: Player, shouldEmit: boolean) {
	const currentWeapon = getCurrentWeapon(player);
	if (currentWeapon.reloadTime <= 0 && currentWeapon.ammo !== currentWeapon.maxAmmo) {
		currentWeapon.reloadTime = currentWeapon.reloadSpeed;
		currentWeapon.spreadIndex = 0;
		showNotification("Reloading");
		if (shouldEmit) {
			socket.emit("r");
		}
		window.setCooldownAnimation(player.currentWeapon, currentWeapon.reloadTime, true);
	}
}
function findServerBullet(bulletIndex: number) {
	return bullets.find((b) => b.serverIndex === bulletIndex);
}
function someoneShot(evt: ShootEvent) {
	if (evt.i !== st.player.index) {
		const tmpPlayer = findUserByIndex(evt.i);
		const bullet = findServerBullet(evt.si);
		if (tmpPlayer && bullet) {
			shootNextBullet(evt, tmpPlayer, target.d, currentTime, bullet);
		}
	}
}
var trailGradient: CanvasGradient | null = null;
// runs the bullet physics step and draws the trails; called early in the frame
// (before the wall front faces in drawMap(1)) so trails crossing behind a wall
// are occluded by it instead of drawing on top of the wall face
function updateBulletsAndDrawTrails(delta: number) {
	graph.globalAlpha = 1;
	for (const bullet of bullets) {
		bullet.wasActiveThisFrame = bullet.active;
		bullet.update(delta, currentTime, clutter, st.gameMap.tiles, st.players);
		if (st.settings.showBTrails && bullet.trailAlpha > 0) {
			let x = Math.round(bullet.startX - st.startX);
			let y = Math.round(bullet.startY - st.startY);
			let x2 = Math.round(bullet.x - st.startX);
			let y2 = Math.round(bullet.y - st.startY);
			const trailDx = x2 - x;
			const trailDy = y2 - y;
			const trailLen = Math.hypot(trailDx, trailDy);
			if (trailLen > 0) {
				// one unit-space gradient reused for every trail: the transform
				// stretches it onto the trail line and globalAlpha applies the
				// per-bullet trailAlpha, so no gradient is allocated per frame
				if (trailGradient == null) {
					trailGradient = graph.createLinearGradient(0, 0, 1, 0);
					trailGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
					trailGradient.addColorStop(1, "rgba(255, 255, 255, 1)");
				}
				graph.save();
				graph.translate(x, y);
				graph.rotate(Math.atan2(trailDy, trailDx));
				graph.scale(trailLen, 1);
				graph.globalAlpha = bullet.trailAlpha;
				graph.strokeStyle = trailGradient;
				graph.lineWidth = bullet.trailWidth;
				graph.beginPath();
				graph.moveTo(0, 0);
				graph.lineTo(1, 0);
				graph.closePath();
				graph.stroke();
				graph.restore();
			}
		}
	}
	graph.globalAlpha = 1;
}

// draws the bullet sprites at their post-update positions; kept at the original
// spot in the frame (after players) so bullets still render above game objects
function drawBullets() {
	graph.globalAlpha = 1;
	for (const bullet of bullets) {
		const drawThisFrame = bullet.active || (bullet.wasActiveThisFrame && !bullet.active);
		if (!drawThisFrame) continue;
		const screenX = bullet.x - st.startX;
		const screenY = bullet.y - st.startY;
		if (canSee(screenX, screenY, bullet.height, bullet.height)) {
			graph.save();
			graph.translate(screenX, screenY);
			if (bullet.spriteIndex === 2) {
				graph.globalCompositeOperation = "lighter";
				graph.globalAlpha = 0.3;
				drawSprite(
					graph,
					bulletSprites[bullet.spriteIndex],
					-(bullet.glowWidth / 2),
					-(bullet.glowHeight / 2) + bullet.height / 2,
					bullet.glowWidth,
					bullet.glowHeight,
					bullet.dir - Math.PI / 2,
					false,
					0,
					0,
					0,
				);
			} else {
				drawSprite(
					graph,
					bulletSprites[bullet.spriteIndex],
					-(bullet.width / 2),
					0,
					bullet.width,
					bullet.height + 8,
					bullet.dir - Math.PI / 2,
					false,
					0,
					0,
					0,
				);
			}
			graph.restore();
		}
	}
}

declare global {
	interface Window {
		joinRoom: (roomName: string, password?: string) => Promise<boolean>;
		refreshLogin: () => Promise<boolean>;
	}
}
// so we don't take over and break the back and forward buttons
// window.addEventListener("popstate", () => {
// 	location.reload();
// });

window.joinRoom = joinRoom;
async function joinRoom(roomName: string, password?: string) {
	if (st.changingLobby) return false;
	// history.pushState(room, "", `${location.origin}/?${room}`);
	st.changingLobby = true;
	st.isHost = false;
	st.hostSecret = null;

	const resp = await fetch(`/api/getIP?room=${roomName}`);
	if (!resp.ok) {
		st.changingLobby = false;
		return false;
	}
	const { ip, port, room } = await resp.json();
	if (room === st.player.room) {
		st.changingLobby = false;
		return false;
	}

	const auth = password ? { password } : undefined;
	if (!socket) {
		socket = io(`/${room}`, { auth });
		st.socket = socket;
		setupSocket(socket);
		setupInitialSocket(socket);
	} else {
		socket.close();
		socket = io(`/${room}`, { auth });
		st.socket = socket;
		setupSocket(socket);
	}
	inMainMenu = true;
	hideUI(true);
	document.getElementById("linkBoxRight")!.style.display = "block";
	st.chatLines = [];

	return true;
}

function closeServer() {
	if (st.isHost && st.hostSecret) {
		socket?.emit("closeRoom", st.hostSecret);
	}
}
declare global {
	interface Window {
		closeServer: typeof closeServer;
	}
}
window.closeServer = closeServer;
var classSpriteSheets: {
	upSprites: Sprite[];
	downSprites: Sprite[];
	leftSprites: Sprite[];
	rightSprites: Sprite[];
	arm: Sprite;
	hD: Sprite;
	hU: Sprite;
	hL: Sprite;
	hR: Sprite;
}[] = [];
function loadPlayerSprites(base: string) {
	classSpriteSheets = [];
	loadPlayerSpriteArray(base, st.characterClasses);
	resize();
}
function loadPlayerSpriteArray(base: string, classes: typeof st.characterClasses) {
	for (const { folderName, hasDown } of classes) {
		let upSprites: Sprite[] = [];
		let downSprites: Sprite[] = [];
		let leftSprites: Sprite[] = [];
		let rightSprites: Sprite[] = [];
		upSprites.push(getSprite(`${base}characters/${folderName}/up`));
		downSprites.push(getSprite(`${base}characters/${folderName}/down`));
		leftSprites.push(getSprite(`${base}characters/${folderName}/left`));
		rightSprites.push(getSprite(`${base}characters/${folderName}/left`));
		const animLength = 3;
		for (let i = 0; i < animLength; ++i) {
			let tmpIndex = i;
			upSprites.push(getSprite(`${base}characters/${folderName}/up${tmpIndex + 1}`));
			let tmpSprite = hasDown
				? getSprite(`${base}characters/${folderName}/down${tmpIndex + 1}`)
				: getSprite(`${base}characters/${folderName}/up${tmpIndex + 1}`);
			downSprites.push(tmpSprite);
			if (tmpIndex >= 2) {
				tmpIndex = 0;
			}
			leftSprites.push(getSprite(`${base}characters/${folderName}/left${tmpIndex + 1}`));
			rightSprites.push(getSprite(`${base}characters/${folderName}/left${tmpIndex + 1}`));
		}
		classSpriteSheets.push({
			upSprites,
			downSprites,
			leftSprites,
			rightSprites,
			arm: getSprite(`${base}characters/${folderName}/arm`),
			hD: getSprite(`${base}characters/${folderName}/hd`),
			hU: getSprite(`${base}characters/${folderName}/hu`),
			hL: getSprite(`${base}characters/${folderName}/hl`),
			hR: getSprite(`${base}characters/${folderName}/hl`),
		});
	}
}
var flagSprites: Sprite[] = [];
var clutterSprites: Sprite[] = [];
var cachedWalls: Record<string, SpriteCanvas> = {};
var floorSprites: Sprite[] = [];
var cachedFloors: Record<string, SpriteCanvas> = {};
var sideWalkSprite: Sprite | null = null;
var ambientSprites: Sprite[] = [];
var wallSpritesSeg: Sprite[] = [];
var bulletSprites: Sprite[] = [];
var cachedShadows: SpriteCanvas[] = [];
var cachedWeaponSprites: Record<string, SpriteCanvas> = {};
var wallSprite: Sprite | null = null;
var darkFillerSprite: Sprite | null = null;
var healthPackSprite: Sprite | null = null;
var lootCrateSprite: Sprite | null = null;

function loadDefaultSprites(base: string) {
	cachedShadows = [];
	flagSprites = [];
	clutterSprites = [];
	cachedWalls = {};
	cachedFloors = {};
	floorSprites = [];
	ambientSprites = [];
	wallSpritesSeg = [];
	bulletSprites = [];
	cachedWeaponSprites = {};
	flagSprites.push(getSprite(`${base}flags/flagb1`));
	flagSprites.push(getSprite(`${base}flags/flagb2`));
	flagSprites.push(getSprite(`${base}flags/flagb3`));
	flagSprites.push(getSprite(`${base}flags/flagr1`));
	flagSprites.push(getSprite(`${base}flags/flagr2`));
	flagSprites.push(getSprite(`${base}flags/flagr3`));
	clutterSprites.push(getSprite(`${base}clutter/crate1`));
	clutterSprites.push(getSprite(`${base}clutter/barrel1`));
	clutterSprites.push(getSprite(`${base}clutter/barrel2`));
	clutterSprites.push(getSprite(`${base}clutter/bottle1`));
	clutterSprites.push(getSprite(`${base}clutter/spike1`));
	wallSprite = getSprite(`${base}wall1`);
	ambientSprites.push(getSprite(`${base}ambient1`));
	darkFillerSprite = getSprite(`${base}darkfiller`);
	st.sprites.light = getSprite(`${base}lighting`);
	floorSprites.push(getSprite(`${base}ground1`));
	floorSprites.push(getSprite(`${base}ground2`));
	floorSprites.push(getSprite(`${base}ground3`));
	sideWalkSprite = getSprite(`${base}sidewalk1`);
	wallSpritesSeg.push(getSprite(`${base}wallSegment1`));
	wallSpritesSeg.push(getSprite(`${base}wallSegment2`));
	wallSpritesSeg.push(getSprite(`${base}wallSegment3`));
	st.sprites.particles = [
		getSprite(`${base}particles/blood/blood`),
		getSprite(`${base}particles/oil/oil`),
		getSprite(`${base}particles/wall`),
		getSprite(`${base}particles/hole`),
		getSprite(`${base}particles/blood/splatter1`),
		getSprite(`${base}particles/blood/splatter2`),
		getSprite(`${base}particles/explosion`),
	];
	healthPackSprite = getSprite(`${base}healthpack`);
	lootCrateSprite = getSprite(`${base}lootCrate1`);
	st.sprites.weapons = [];
	for (const name of weaponNames) {
		st.sprites.weapons.push({
			upSprite: getSprite(`${base}weapons/${name}/up`),
			downSprite: getSprite(`${base}weapons/${name}/up`),
			leftSprite: getSprite(`${base}weapons/${name}/left`),
			rightSprite: getSprite(`${base}weapons/${name}/left`),
			icon: getSprite(`${base}weapons/${name}/icon`),
		});
	}
	bulletSprites.push(getSprite(`${base}weapons/bullet`));
	bulletSprites.push(getSprite(`${base}weapons/grenade`));
	bulletSprites.push(getSprite(`${base}weapons/flame`));
	resize();
}

var mainTitleText = document.getElementById("mainTitleText")!;
function updateMenuInfo(info: string) {
	mainTitleText.textContent = info;
}

var linkedMod = location.hash.replace("#", "");
const assetsLoadPromise = loadModPack(linkedMod, linkedMod === "");
var loadingTexturePack = false;

var modInfo = document.getElementById("modInfo")!;
function setModInfoText(info: string) {
	if (modInfo) {
		modInfo.textContent = info;
	}
}

declare global {
	interface Window {
		loadModPack: typeof loadModPack;
	}
}
window.loadModPack = loadModPack;
async function loadModPack(url: string, isBaseAssets: boolean) {
	try {
		if (loadingTexturePack) return;
		let modPath = "";
		if (isBaseAssets) {
			st.doSounds = false;
			modPath = "/res.zip";
		} else {
			if (url === "") {
				setModInfoText("Please enter a mod Key/URL");
				return false;
			}
			st.doSounds = true;
			loadingTexturePack = true;
			if (url.includes(".")) {
				modPath = url;
				if (modPath.startsWith("/")) {
					modPath = `${window.location.origin}${modPath}`;
				} else if (!modPath.match(/^https?:\/\//i)) {
					modPath = `http://${modPath}`;
				}
			} else {
				modPath = `https://dl.dropboxusercontent.com/s/${url}/vertixmod.zip`;
			}
		}
		if (!isBaseAssets) {
			setModInfoText("Loading...");
		}

		const reader = new zip.ZipReader(new zip.HttpReader(modPath));

		const entries = await reader.getEntries();
		for (const entry of entries) {
			if (entry.directory) continue;
			entry.filename = entry.filename.replace("vertixmod/", "");
			let fileFormat = entry.filename.split(".")[entry.filename.split(".").length - 1];
			let basePath = entry.filename.split("/")[0];
			if (basePath === "scripts") {
				let data = await entry.getData(new zip.TextWriter());
				if (entry.filename.includes("modinfo")) {
					setModInfoText(data);
				} else if (entry.filename.includes("cssmod")) {
					let styleElem = document.createElement("style");
					styleElem.textContent = data;
					document.head.appendChild(styleElem);
				} else if (entry.filename.includes("gameinfo")) {
					data = data.replace(/(\r\n|\n|\r)/gm, "");
					let parsed = JSON.parse(data);
					updateMenuInfo(parsed.name);
				} else if (entry.filename.includes("charinfo")) {
					let split = data.replace(/(\r\n|\n|\r)/gm, "").split("|");
					let tmp = split.map((s) => JSON.parse(s));
					st.characterClasses = tmp;
					// hacky and may not work
					st.loadout.class = st.characterClasses.find(
						(c) => c.folderName === st.loadout.class.folderName,
					)!;
				}
			} else if (basePath === "sprites") {
				let data = await entry.getData(new zip.BlobWriter("image/png"));
				let imgAsDataURL = URL.createObjectURL(data);
				localStorage.setItem(entry.filename, imgAsDataURL);
			} else if (basePath === "sounds") {
				entry.filename = entry.filename.replace(`.${fileFormat}`, "");
				let data = await entry.getData(new zip.BlobWriter(`audio/${fileFormat}`));
				let soundAsDataURL = URL.createObjectURL(data);
				localStorage.setItem(`${entry.filename}data`, soundAsDataURL);
				localStorage.setItem(`${entry.filename}format`, fileFormat);
			}
		}
		spriteIndex = 0;
		loadPlayerSprites("sprites/");
		loadDefaultSprites("sprites/");
		loadSounds("sounds/");
		loadingTexturePack = false;
	} catch (err) {
		console.error(err);
		loadingTexturePack = false;
		setModInfoText("Mod could not be loaded");
	}
}
function getPlayerSprite(classIdx: number, angle: number, animIdx: number) {
	let tmpSpriteCollection = classSpriteSheets[classIdx];
	if (!tmpSpriteCollection) {
		return null;
	}
	let tmpSprite: Sprite;
	if (angle === 90) {
		tmpSprite = tmpSpriteCollection.leftSprites[animIdx];
	} else if (angle === 180) {
		tmpSprite = tmpSpriteCollection.upSprites[animIdx];
	} else if (angle === 270) {
		if (
			!tmpSpriteCollection.rightSprites[animIdx].flipped &&
			tmpSpriteCollection.rightSprites[animIdx].isLoaded
		) {
			tmpSpriteCollection.rightSprites[animIdx] = flipSprite(
				tmpSpriteCollection.rightSprites[animIdx],
				true,
			);
		}
		tmpSprite = tmpSpriteCollection.rightSprites[animIdx];
	} else {
		tmpSprite = tmpSpriteCollection.downSprites[animIdx];
	}
	return tmpSprite;
}
const cachedHats: CachedSpriteData[] = [];
function getHatSprite(playerObj: Player, dir: number) {
	const tmpAcc = playerObj.account;
	if (!tmpAcc) return null;
	if (tmpAcc.hat) {
		const tmpSprite = cachedHats[tmpAcc.hat.id];
		if (!tmpSprite) {
			const hat = {
				lS: new Image() as Sprite,
				uS: new Image() as Sprite,
				rS: new Image() as Sprite,
				dS: new Image() as Sprite,
				imgToLoad: 0,
			};
			if (tmpAcc.hat.left) {
				hat.imgToLoad++;
				hat.lS.index = spriteIndex;
				spriteIndex++;
				hat.lS.src = `/images/hats/${tmpAcc.hat.id}/l.png`;
				hat.lS.onload = () => {
					hat.imgToLoad--;
					hat.lS.isLoaded = true;
					hat.lS.onload = null;
				};
				hat.imgToLoad++;
				hat.rS.index = spriteIndex;
				spriteIndex++;
				hat.rS.src = `/images/hats/${tmpAcc.hat.id}/l.png`;
				hat.rS.onload = () => {
					hat.rS = flipSprite(hat.rS, true);
					hat.imgToLoad--;
					hat.rS.isLoaded = true;
					hat.rS.onload = null;
				};
			}
			if (tmpAcc.hat.up) {
				hat.imgToLoad++;
				hat.uS.index = spriteIndex;
				spriteIndex++;
				hat.uS.src = `/images/hats/${tmpAcc.hat.id}/u.png`;
				hat.uS.onload = () => {
					hat.imgToLoad--;
					hat.uS.isLoaded = true;
					hat.uS.onload = null;
				};
			}
			hat.imgToLoad++;
			hat.dS.index = spriteIndex;
			spriteIndex++;
			hat.dS.src = `/images/hats/${tmpAcc.hat.id}/d.png`;
			hat.dS.onload = () => {
				hat.imgToLoad--;
				hat.dS.isLoaded = true;
				hat.dS.onload = null;
			};
			cachedHats[tmpAcc.hat.id] = hat;
		} else if (tmpSprite.imgToLoad <= 0) {
			if (tmpAcc.hat.left && dir === 90) {
				return tmpSprite.lS;
			} else if (tmpAcc.hat.up && dir === 180) {
				return tmpSprite.uS;
			} else if (tmpAcc.hat.left && dir === 270) {
				return tmpSprite.rS;
			} else {
				return tmpSprite.dS;
			}
		}
	} else {
		let tmpSprite: Sprite;
		const tmpSpriteCollection = classSpriteSheets[playerObj.classIndex];
		if (!tmpSpriteCollection) {
			return null;
		}
		if (dir === 90) {
			tmpSprite = tmpSpriteCollection.hL;
		} else if (dir === 180) {
			tmpSprite = tmpSpriteCollection.hU;
		} else if (dir === 270) {
			if (!tmpSpriteCollection.hR.flipped && tmpSpriteCollection.hR.isLoaded) {
				tmpSpriteCollection.hR = flipSprite(tmpSpriteCollection.hR, true);
			}
			tmpSprite = tmpSpriteCollection.hR;
		} else {
			tmpSprite = tmpSpriteCollection.hD;
		}
		return tmpSprite;
	}
}
const cachedShirts: CachedSpriteData[] = [];
function getShirtSprite(playerObj: Player, dir: number) {
	const tmpAcc = playerObj.account;
	if (!tmpAcc?.shirt || playerObj.classIndex === 8) return null;
	const tmpSprite = cachedShirts[tmpAcc.shirt.id];
	if (!tmpSprite) {
		const d = {
			lS: new Image() as Sprite,
			uS: new Image() as Sprite,
			rS: new Image() as Sprite,
			dS: new Image() as Sprite,
			imgToLoad: 0,
		};
		if (tmpAcc.shirt.left) {
			d.imgToLoad++;
			d.lS = new Image() as Sprite;
			d.lS.index = spriteIndex;
			spriteIndex++;
			d.lS.src = `/images/shirts/${tmpAcc.shirt.id}/l.png`;
			d.lS.onload = () => {
				d.imgToLoad--;
				d.lS.isLoaded = true;
				d.lS.onload = null;
			};
			d.imgToLoad++;
			d.rS = new Image() as Sprite;
			d.rS.index = spriteIndex;
			spriteIndex++;
			d.rS.src = `/images/shirts/${tmpAcc.shirt.id}/l.png`;
			d.rS.onload = () => {
				d.rS = flipSprite(d.rS, true);
				d.imgToLoad--;
				d.rS.isLoaded = true;
				d.rS.onload = null;
			};
		}
		if (tmpAcc.shirt.up) {
			d.imgToLoad++;
			d.uS = new Image() as Sprite;
			d.uS.index = spriteIndex;
			spriteIndex++;
			d.uS.src = `/images/shirts/${tmpAcc.shirt.id}/u.png`;
			d.uS.onload = () => {
				d.imgToLoad--;
				d.uS.isLoaded = true;
				d.uS.onload = null;
			};
		}
		d.imgToLoad++;
		d.dS = new Image() as Sprite;
		d.dS.index = spriteIndex;
		spriteIndex++;
		d.dS.src = `/images/shirts/${tmpAcc.shirt.id}/d.png`;
		d.dS.onload = () => {
			d.imgToLoad--;
			d.dS.isLoaded = true;
			d.dS.onload = null;
		};
		cachedShirts[tmpAcc.shirt.id] = d;
	} else if (tmpSprite.imgToLoad <= 0) {
		if (tmpAcc.shirt.left && dir === 90) {
			return tmpSprite.lS;
		} else if (tmpAcc.shirt.up && dir === 180) {
			return tmpSprite.uS;
		} else if (tmpAcc.shirt.left && dir === 270) {
			return tmpSprite.rS;
		} else {
			return tmpSprite.dS;
		}
	}
}
function getWeaponSprite(weaponIndex: number, camo: number, angle: number) {
	const tmpIndex = `${weaponIndex}${camo}${angle}`;
	let tmpSprite = cachedWeaponSprites[tmpIndex];
	if (!tmpSprite) {
		let wepSprites = st.sprites.weapons[weaponIndex];
		if (!wepSprites) return;
		let wepSprite: Sprite;
		if (angle === 90) {
			wepSprite = wepSprites.leftSprite;
		} else if (angle === 180) {
			wepSprite = wepSprites.upSprite;
		} else if (angle === 270) {
			if (!wepSprites.rightSprite.flipped && wepSprites.rightSprite.isLoaded) {
				wepSprites.rightSprite = flipSprite(wepSprites.rightSprite, true);
			}
			wepSprite = wepSprites.rightSprite;
		} else {
			wepSprite = wepSprites.downSprite;
		}
		let canvasElem = document.createElement("canvas");
		let ctx = canvasElem.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		canvasElem.width = wepSprite.width;
		canvasElem.height = wepSprite.height;
		ctx.drawImage(wepSprite, 0, 0, canvasElem.width, canvasElem.height);
		tmpSprite = canvasElem;
		cachedWeaponSprites[tmpIndex] = tmpSprite;
		if (camo >= 0) {
			let img = new Image() as Sprite;
			let wpnImg = tmpSprite;
			let flip = wepSprite.flipped;
			img.onload = () => {
				var canvas = document.createElement("canvas");
				var ctx = canvas.getContext("2d")!;
				ctx.imageSmoothingEnabled = false;
				canvas.width = img.width;
				canvas.height = img.height;
				img.onload = null;
				ctx.drawImage(wpnImg, 0, 0, img.width, img.height);
				ctx.globalCompositeOperation = "source-atop";
				ctx.globalAlpha = 0.75;
				ctx.drawImage(flip ? flipSprite(img, true) : img, 0, 0, img.width, img.height);
				cachedWeaponSprites[tmpIndex] = canvas;
			};
			img.src = `/images/camos/${camo + 1}.png`;
		}
	}
	return cachedWeaponSprites[tmpIndex];
}
const playerCanvas = document.createElement("canvas");
playerCanvas.width = 300;
playerCanvas.height = 500;
const playerContext = playerCanvas.getContext("2d")!;
playerContext.imageSmoothingEnabled = false;

function drawPlayer(plr: Player, delta: number) {
	if (plr.dead || (plr.index !== st.player.index && !plr.onScreen)) return;
	if (plr.jumpY === undefined) {
		plr.jumpY = 0;
	}
	playerContext.clearRect(0, 0, playerCanvas.width, playerCanvas.height);
	playerContext.save();
	playerContext.globalAlpha = 0.9;
	playerContext.translate(playerCanvas.width / 2, playerCanvas.height / 2);
	const weaponAngle = (Math.PI / 180) * plr.angle;
	const snappedAngle = snapAngleToCardinal(plr.angle);
	const screenX = plr.x - st.startX;
	let screenY = plr.y - plr.jumpY - st.startY;
	if (plr.animIndex === 1) {
		screenY -= 3;
	}
	const currentWeapon = plr.weapons.length > 0 ? getCurrentWeapon(plr) : null;
	const weaponSprite = currentWeapon
		? getWeaponSprite(currentWeapon.weaponIndex, currentWeapon.camo!, snappedAngle)
		: null;
	const armSprite = classSpriteSheets[plr.classIndex]?.arm;
	if (currentWeapon) {
		if (!currentWeapon.front && weaponSprite != null) {
			playerContext.save();
			playerContext.translate(0, -currentWeapon.yOffset);
			playerContext.rotate(weaponAngle);
			playerContext.translate(0, currentWeapon.holdDist);
			drawSprite(
				playerContext,
				weaponSprite,
				-(currentWeapon.width / 2),
				0,
				currentWeapon.width,
				currentWeapon.length,
				0,
				false,
				0,
				0,
				0,
			);
			playerContext.translate(0, -currentWeapon.holdDist + 6);
			if (armSprite != null) {
				playerContext.translate(3, -10);
				drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				playerContext.translate(-16, -8);
				drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				playerContext.restore();
			}
		}
	}
	playerContext.globalAlpha = 1;
	const lowerBodySprite = getPlayerSprite(plr.classIndex, snappedAngle, plr.animIndex + 1);
	if (lowerBodySprite != null) {
		drawSprite(
			playerContext,
			lowerBodySprite,
			-(plr.width / 2),
			-(plr.height * 0.318),
			plr.width,
			plr.height * 0.318,
			0,
			true,
			plr.jumpY * 1.5,
			0.5,
			0,
		);
	}
	const upperBodySprite = getPlayerSprite(plr.classIndex, snappedAngle, 0);
	if (upperBodySprite != null) {
		drawSprite(
			playerContext,
			upperBodySprite,
			-(plr.width / 2),
			-plr.height,
			plr.width,
			plr.height * 0.6819999999999999,
			0,
			true,
			plr.jumpY * 1.5 + plr.height * 0.477,
			0.5,
			0,
		);
	}
	const shirtSprite = getShirtSprite(plr, snappedAngle);
	if (shirtSprite != null) {
		playerContext.globalAlpha = 0.9;
		drawSprite(
			playerContext,
			shirtSprite,
			-(plr.width / 2),
			-plr.height,
			plr.width,
			plr.height * 0.6819999999999999,
			0,
			true,
			plr.jumpY * 1.5 + plr.height * 0.477,
			0.5,
			0,
		);
		playerContext.globalAlpha = 1;
	}
	const hatScale = plr.width * 0.833;
	const hatSprite = getHatSprite(plr, snappedAngle);
	if (hatSprite != null) {
		drawSprite(
			playerContext,
			hatSprite,
			-(hatScale / 2),
			-(plr.height + hatScale * 0.045),
			//-(b.height + p * 0.095),
			hatScale,
			hatScale,
			0,
			false,
			0,
			0.5,
			0,
		);
	}
	if (currentWeapon) {
		playerContext.globalAlpha = 0.9;
		if (currentWeapon.front && weaponSprite != null) {
			playerContext.save();
			playerContext.translate(0, -currentWeapon.yOffset);
			playerContext.rotate(weaponAngle);
			playerContext.translate(0, currentWeapon.holdDist);
			drawSprite(
				playerContext,
				weaponSprite,
				-(currentWeapon.width / 2),
				0,
				currentWeapon.width,
				currentWeapon.length,
				0,
				false,
				0,
				0,
				0,
			);
			playerContext.translate(0, -currentWeapon.holdDist + 10);
			if (armSprite != null) {
				if (snappedAngle === 270) {
					playerContext.restore();
					playerContext.save();
					playerContext.translate(-4, -currentWeapon.yOffset + 8);
					playerContext.rotate(weaponAngle);
					drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				} else if (snappedAngle === 90) {
					playerContext.restore();
					playerContext.save();
					playerContext.translate(0, -currentWeapon.yOffset);
					playerContext.rotate(weaponAngle);
					drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				} else {
					playerContext.translate(10, -13);
					playerContext.rotate(0.7);
					drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
					playerContext.rotate(-0.7);
					playerContext.translate(-28, -1);
					playerContext.rotate(-0.25);
					drawSprite(playerContext, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
					playerContext.rotate(0.25);
				}
				playerContext.restore();
			}
		}
	}
	if (plr.isSpawnProtected) {
		playerContext.globalCompositeOperation = "source-atop";
		playerContext.fillStyle =
			plr.team !== st.player.team ? "rgba(255,179,179,0.5)" : "rgba(179,231,255,0.5)";
		playerContext.fillRect(
			-playerCanvas.width / 2,
			-playerCanvas.height / 2,
			playerCanvas.width,
			playerCanvas.height,
		);
		playerContext.globalCompositeOperation = "source-over";
	}
	if (plr.hitFlash !== undefined && plr.hitFlash > 0) {
		playerContext.globalCompositeOperation = "source-atop";
		playerContext.fillStyle = `rgba(255, 255, 255, ${plr.hitFlash})`;
		playerContext.fillRect(
			-playerCanvas.width / 2,
			-playerCanvas.height / 2,
			playerCanvas.width,
			playerCanvas.height,
		);
		playerContext.globalCompositeOperation = "source-over";
		plr.hitFlash -= delta * 0.01;
		if (plr.hitFlash < 0) {
			plr.hitFlash = 0;
		}
	}
	drawSprite(
		graph,
		playerCanvas,
		screenX - playerCanvas.width / 2,
		screenY - playerCanvas.height / 2,
		playerCanvas.width,
		playerCanvas.height,
		0,
		false,
		0,
		0,
		0,
	);
	playerContext.restore();
}

declare global {
	interface Window {
		renderLoadoutPreview: typeof renderLoadoutPreview;
	}
}
window.renderLoadoutPreview = renderLoadoutPreview;
// Draws the currently selected loadout (st.loadout) as a static, front-facing
// character on the given canvas. Reuses the same sprite getters as drawPlayer
// but touches no game/camera state, so the live renderer is unaffected.
// Sprites and hat/shirt images load lazily; drawSprite skips images that
// aren't ready yet, so callers should redraw a few times after loadout changes.
function renderLoadoutPreview(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d")!;
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const classIndex = st.characterClasses.findIndex(
		(c) => c.folderName === st.loadout.class.folderName,
	);
	if (classIndex < 0) return;
	const cls = st.loadout.class;
	const previewPlayer = {
		classIndex,
		width: cls.width,
		height: cls.height,
		account: {
			rank: 0,
			hat: st.loadout.hat ?? undefined,
			shirt: st.loadout.shirt ?? undefined,
		},
	} as unknown as Player;

	ctx.save();
	// feet baseline placed so the hat (above) and the weapon (below) both fit;
	// drawing is in world units sized for a 200px-wide canvas, so scale up
	// proportionally when the preview canvas is larger
	const previewScale = canvas.width / 200;
	ctx.translate(canvas.width / 2, canvas.height - 60 * previewScale);
	ctx.scale(previewScale, previewScale);
	ctx.globalAlpha = 1;

	const lowerBodySprite = getPlayerSprite(classIndex, 0, 1);
	if (lowerBodySprite != null) {
		drawSprite(
			ctx,
			lowerBodySprite,
			-(cls.width / 2),
			-(cls.height * 0.318),
			cls.width,
			cls.height * 0.318,
			0,
			true,
			0,
			0.5,
			0,
		);
	}
	const upperBodySprite = getPlayerSprite(classIndex, 0, 0);
	if (upperBodySprite != null) {
		drawSprite(
			ctx,
			upperBodySprite,
			-(cls.width / 2),
			-cls.height,
			cls.width,
			cls.height * 0.682,
			0,
			true,
			cls.height * 0.477,
			0.5,
			0,
		);
	}
	const shirtSprite = getShirtSprite(previewPlayer, 0);
	if (shirtSprite != null) {
		ctx.globalAlpha = 0.9;
		drawSprite(
			ctx,
			shirtSprite,
			-(cls.width / 2),
			-cls.height,
			cls.width,
			cls.height * 0.682,
			0,
			true,
			cls.height * 0.477,
			0.5,
			0,
		);
		ctx.globalAlpha = 1;
	}
	const hatScale = cls.width * 0.833;
	const hatSprite = getHatSprite(previewPlayer, 0);
	if (hatSprite != null) {
		drawSprite(
			ctx,
			hatSprite,
			-(hatScale / 2),
			-(cls.height + hatScale * 0.045),
			hatScale,
			hatScale,
			0,
			false,
			0,
			0.5,
			0,
		);
	}

	// front-facing primary weapon pointing down, with both arms — mirrors
	// drawPlayer's front-weapon branch for the down-facing (angle 0) case
	const baseWeapon = weapons[cls.weaponIndexes[0]];
	if (baseWeapon) {
		const camoId = st.loadout.primaryCamo?.id ?? 0;
		const weaponSprite = getWeaponSprite(baseWeapon.weaponIndex, camoId, 0);
		const armSprite = classSpriteSheets[classIndex]?.arm;
		if (weaponSprite != null) {
			ctx.globalAlpha = 0.9;
			ctx.save();
			ctx.translate(0, -baseWeapon.yOffset + baseWeapon.holdDist);
			drawSprite(
				ctx,
				weaponSprite,
				-(baseWeapon.width / 2),
				0,
				baseWeapon.width,
				baseWeapon.length,
				0,
				false,
				0,
				0,
				0,
			);
			ctx.translate(0, -baseWeapon.holdDist + 10);
			if (armSprite != null) {
				ctx.translate(10, -13);
				ctx.rotate(0.7);
				drawSprite(ctx, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				ctx.rotate(-0.7);
				ctx.translate(-28, -1);
				ctx.rotate(-0.25);
				drawSprite(ctx, armSprite, 0, 0, 8, 32, 0, false, 0, 0, 0);
				ctx.rotate(0.25);
			}
			ctx.restore();
			ctx.globalAlpha = 1;
		}
	}
	ctx.restore();
}

function drawFlag(flg: FlagObject) {
	flg.ac--;
	if (flg.ac <= 0) {
		flg.ac = 5;
		flg.ai++;
		if (flg.ai > 2) {
			flg.ai = 0;
		}
	}
	drawSprite(
		graph,
		flagSprites[flg.ai + (flg.team === st.player.team ? 0 : 3)],
		flg.x - flg.w / 2 - st.startX,
		flg.y - flg.h - st.startY,
		flg.w,
		flg.h,
		0,
		true,
		0,
		0.5,
		0,
	);
}

function drawClutter(clt: ClutterObject) {
	if (clt.active && canSee(clt.x - st.startX, clt.y - st.startY, clt.w, clt.h)) {
		drawSprite(
			graph,
			clutterSprites[clt.i],
			clt.x - st.startX,
			clt.y - clt.h - st.startY,
			clt.w,
			clt.h,
			0,
			!!clt.s,
			0,
			0.5,
			0,
		);
	}
}

type GameObjectRenderEntry =
	| { data: Player; type: "player" }
	| { data: ClutterObject; type: "clutter" }
	| { data: FlagObject; type: "flag" };
// persistent pooled list: refilled and sorted in place every frame so no
// per-frame array/wrapper allocations (sort is stable, same tie-order as toSorted)
const gameObjectRenderList: GameObjectRenderEntry[] = [];
function getGameObjectRenderData() {
	const total = st.players.length + clutter.length + flags.length;
	while (gameObjectRenderList.length < total) {
		gameObjectRenderList.push({ data: null as unknown as Player, type: "player" });
	}
	gameObjectRenderList.length = total;
	let n = 0;
	for (const player of st.players) {
		const entry = gameObjectRenderList[n++] as { data: Player; type: string };
		entry.data = player;
		entry.type = "player";
	}
	for (const clt of clutter) {
		const entry = gameObjectRenderList[n++] as { data: ClutterObject; type: string };
		entry.data = clt;
		entry.type = "clutter";
	}
	for (const flag of flags) {
		const entry = gameObjectRenderList[n++] as { data: FlagObject; type: string };
		entry.data = flag;
		entry.type = "flag";
	}
	gameObjectRenderList.sort((a, b) => a.data.y - b.data.y);
	return gameObjectRenderList;
}

function drawGameObjects(delta: number) {
	const gameObjects = getGameObjectRenderData();
	for (const gameObject of gameObjects) {
		switch (gameObject.type) {
			case "player":
				drawPlayer(gameObject.data, delta);
				break;
			case "flag":
				drawFlag(gameObject.data);
				break;
			case "clutter":
				drawClutter(gameObject.data);
				break;
		}
	}
	graph.globalAlpha = 1;
}

function drawPlayerNames() {
	const playerConfig = {
		border: 6,
		textColor: "#efefef",
		textBorder: "#3a3a3a",
		textBorderSize: 3,
		defaultSize: 30,
	};
	graph.lineWidth = playerConfig.textBorderSize;
	graph.fillStyle = playerConfig.textColor;
	graph.miterLimit = 1;
	graph.lineJoin = "round";
	graph.globalAlpha = 1;
	for (const plr of st.players) {
		if (plr.dead || (plr.index !== st.player.index && !plr.onScreen)) continue;

		const nameTextSize = plr.height / 3.2;
		const healthBarWidth = Math.min(200, (plr.maxHealth / 100) * 100);
		let shapeX = plr.x - st.startX;
		let shapeY = plr.y - plr.jumpY - plr.nameYOffset - st.startY;
		if (plr.account !== undefined && plr.account.hat != null) {
			shapeY -= plr.account.hat.nameY;
		}
		let playerName = plr.name;
		let rankText = plr.loggedIn ? plr.account.rank.toString() : "";
		// h = graph.measureText(playerName);
		let nameColor = plr.team !== st.player.team ? TeamColors.Red : TeamColors.Blue;
		if (st.settings.showNames) {
			const renderedName = renderShadedAnimText(
				playerName,
				nameTextSize * textSizeMult,
				"#ffffff",
				5,
				"",
			);
			graph.drawImage(
				renderedName,
				shapeX - renderedName.width / 2,
				shapeY - plr.height * 1.4 - renderedName.height / 2,
				renderedName.width,
				renderedName.height,
			);
			if (rankText) {
				const renderedRank = renderShadedAnimText(
					rankText,
					nameTextSize * 1.6 * textSizeMult,
					"#ffffff",
					6,
					"",
				);
				graph.drawImage(
					renderedRank,
					shapeX - renderedName.width / 2 - renderedRank.width - textSizeMult * 5,
					shapeY - plr.height * 1.4 - (renderedRank.height - renderedName.height / 2),
					renderedRank.width,
					renderedRank.height,
				);
			}
			if (plr.account?.clan) {
				const renderedClan = renderShadedAnimText(
					` [${plr.account?.clan}]`,
					nameTextSize * textSizeMult,
					nameColor,
					5,
					"",
				);
				graph.drawImage(
					renderedClan,
					shapeX + renderedName.width / 2,
					shapeY - plr.height * 1.4 - renderedName.height / 2,
					renderedClan.width,
					renderedName.height,
				);
			}
		}
		graph.fillStyle = nameColor;
		graph.fillRect(
			shapeX - (healthBarWidth / 2) * (plr.health / plr.maxHealth),
			shapeY - plr.height * 1.16,
			(plr.health / plr.maxHealth) * healthBarWidth,
			10,
		);
	}
}
function drawBackground() {
	drawSprite(
		graph,
		darkFillerSprite!,
		0,
		0,
		st.maxScreenWidth,
		st.maxScreenHeight,
		0,
		false,
		0,
		0,
		0,
	);
}
function getCachedWall(tile: Tile) {
	let cacheKey = `${tile.left}${tile.right}${tile.top}${tile.bottom}${tile.topLeft}${tile.topRight}${tile.bottomLeft}${tile.bottomRight}${tile.edgeTile}${tile.hasCollision}`;

	if (cachedWalls[cacheKey] === undefined && wallSprite?.isLoaded) {
		let canvasElem = document.createElement("canvas");
		let ctx = canvasElem.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		canvasElem.width = tile.scale;
		canvasElem.height = tile.scale;
		ctx.drawImage(wallSprite, 0, 0, tile.scale, tile.scale);
		drawSprite(ctx, darkFillerSprite!, 12, 12, tile.scale - 24, tile.scale - 24, 0, false, 0, 0, 0);
		if (tile.left === 1) {
			drawSprite(ctx, darkFillerSprite!, 0, 12, 12, tile.scale - 24, 0, false, 0, 0, 0);
		}
		if (tile.right === 1) {
			drawSprite(
				ctx,
				darkFillerSprite!,
				tile.scale - 12,
				12,
				12,
				tile.scale - 24,
				0,
				false,
				0,
				0,
				0,
			);
		}
		if (tile.top === 1) {
			drawSprite(ctx, darkFillerSprite!, 12, 0, tile.scale - 24, 12, 0, false, 0, 0, 0);
		}
		if (tile.bottom === 1) {
			drawSprite(
				ctx,
				darkFillerSprite!,
				12,
				tile.scale - 12,
				tile.scale - 24,
				12,
				0,
				false,
				0,
				0,
				0,
			);
		}
		if (!tile.hasCollision || (tile.topLeft === 1 && tile.top === 1 && tile.left === 1)) {
			drawSprite(ctx, darkFillerSprite!, 0, 0, 12, 12, 0, false, 0, 0, 0);
		}
		if (!tile.hasCollision || (tile.topRight === 1 && tile.top === 1 && tile.right === 1)) {
			drawSprite(ctx, darkFillerSprite!, tile.scale - 12, 0, 12, 12, 0, false, 0, 0, 0);
		}
		if (!tile.hasCollision || (tile.bottomLeft === 1 && tile.bottom === 1 && tile.left === 1)) {
			drawSprite(ctx, darkFillerSprite!, 0, tile.scale - 12, 12, 12, 0, false, 0, 0, 0);
		}
		if (!tile.hasCollision || (tile.bottomRight === 1 && tile.bottom === 1 && tile.right === 1)) {
			drawSprite(
				ctx,
				darkFillerSprite!,
				tile.scale - 12,
				tile.scale - 12,
				12,
				12,
				0,
				false,
				0,
				0,
				0,
			);
		}
		cachedWalls[cacheKey] = canvasElem;
	}
	return cachedWalls[cacheKey];
}
var tilesPerFloorTile = 8;
function getCachedFloor(tile: Tile) {
	let tmpIndex = `${tile.spriteIndex}${tile.left}${tile.right}${tile.top}${tile.bottom}${tile.topLeft}${tile.topRight}`;
	if (cachedFloors[tmpIndex] === undefined && sideWalkSprite != null && sideWalkSprite.isLoaded) {
		let tmpCanvas = document.createElement("canvas");
		let ctx = tmpCanvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;

		tmpCanvas.width = tile.scale;
		tmpCanvas.height = tile.scale * (tile.bottom ? 0.51 : 1);
		ctx.drawImage(floorSprites[tile.spriteIndex], 0, 0, tile.scale, tile.scale);
		const s = tile.scale / tilesPerFloorTile;
		if (tile.topLeft === 1) {
			renderSideWalks(ctx, 1, s, 0, 0, 0, 0, 0);
		}
		if (tile.topRight === 1) {
			renderSideWalks(ctx, 1, s, Math.PI, tile.scale - s, 0, 0, 0);
		}
		if (tile.left === 1) {
			if (tile.top === 1) {
				renderSideWalks(ctx, 2, s, null, 0, 0, 0, s);
				renderSideWalks(ctx, tilesPerFloorTile - 2, s, 0, 0, s * 2, 0, s);
			} else {
				renderSideWalks(ctx, tilesPerFloorTile, s, 0, 0, 0, 0, s);
			}
		}
		if (tile.right === 1) {
			if (tile.top === 1) {
				renderSideWalks(ctx, 2, s, null, tile.scale - s, 2, 0, s);
				renderSideWalks(ctx, tilesPerFloorTile - 2, s, Math.PI, tile.scale - s, s * 2, 0, s);
			} else {
				renderSideWalks(ctx, tilesPerFloorTile, s, Math.PI, tile.scale - s, 0, 0, s);
			}
		}
		if (tile.top === 1) {
			renderSideWalks(ctx, tilesPerFloorTile, s, Math.PI / 2, 0, 0, s, 0);
		}
		if (tile.bottom === 1) {
			renderSideWalks(ctx, tilesPerFloorTile, s, 0, 0, tile.scale - s, s, 0);
		}
		cachedFloors[tmpIndex] = tmpCanvas;
	}
	return cachedFloors[tmpIndex];
}
function renderSideWalks(
	ctx: CanvasRenderingContext2D,
	count: number,
	scale: number,
	rot: number | null,
	x: number,
	y: number,
	xInc: number,
	yInc: number,
) {
	for (let i = 0; i < count; ++i) {
		ctx.drawImage(sideWalkSprite!, x, y, scale, scale);
		if (rot != null) {
			ctx.save();
			ctx.translate(x + scale / 2, y + scale / 2);
			ctx.rotate(rot);
			ctx.drawImage(ambientSprites[0], -(scale / 2), -(scale / 2), scale, scale);
			ctx.restore();
		}
		x += xInc;
		y += yInc;
	}
}
function drawMap(layer: number) {
	if (!st.gameMap) return;
	for (const tile of st.gameMap.tiles) {
		if (layer === 0) {
			if (
				!tile.wall &&
				canSee(tile.x - st.startX, tile.y - st.startY, mapTileScale, mapTileScale)
			) {
				let tmpTlSprite = getCachedFloor(tile);
				if (tmpTlSprite !== undefined) {
					drawSprite(
						graph!,
						tmpTlSprite,
						tile.x - st.startX,
						tile.y - st.startY,
						tmpTlSprite.width,
						tmpTlSprite.height,
						0,
						false,
						0,
						0,
						0,
					);
				}
			}
		} else if (layer === 1) {
			if (
				tile.wall &&
				!tile.bottom &&
				canSee(
					tile.x - st.startX,
					tile.y - st.startY + mapTileScale * 0.5,
					mapTileScale,
					mapTileScale * 0.75,
				)
			) {
				drawSprite(
					graph!,
					wallSpritesSeg[tile.spriteIndex],
					tile.x - st.startX,
					tile.y + Math.round(mapTileScale / 2) - st.startY,
					mapTileScale,
					mapTileScale / 2,
					0,
					true,
					-(tile.scale / 2),
					0.5,
					tile.scale,
				);
			}
		} else if (
			layer === 2 &&
			tile.wall &&
			canSee(
				tile.x - st.startX,
				tile.y - st.startY - mapTileScale * 0.5,
				mapTileScale,
				mapTileScale,
			)
		) {
			let tmpTlSprite = getCachedWall(tile);
			if (tmpTlSprite !== undefined) {
				drawSprite(
					graph!,
					tmpTlSprite,
					tile.x - st.startX,
					Math.round(tile.y - mapTileScale / 2 - st.startY),
					mapTileScale,
					mapTileScale,
					0,
					false,
					0,
					0,
					0,
				);
			}
		}
	}
	if (layer === 0) {
		for (const tmpPickup of st.gameMap.pickups) {
			if (!tmpPickup.active || !canSee(tmpPickup.x - st.startX, tmpPickup.y - st.startY, 0, 0))
				continue;

			if (tmpPickup.type === "healthpack") {
				drawSprite(
					graph!,
					healthPackSprite!,
					tmpPickup.x - tmpPickup.scale / 2 - st.startX,
					tmpPickup.y - tmpPickup.scale / 2 - st.startY,
					tmpPickup.scale,
					tmpPickup.scale,
					0,
					true,
					0,
					0.5,
					0,
				);
			} else {
				drawSprite(
					graph!,
					lootCrateSprite!,
					tmpPickup.x - tmpPickup.scale / 2 - st.startX,
					tmpPickup.y - tmpPickup.scale / 2 - st.startY,
					tmpPickup.scale,
					tmpPickup.scale,
					0,
					true,
					0,
					0.5,
					0,
				);
			}
		}
	}
}
function drawSprite(
	ctx: CanvasRenderingContext2D,
	sprite: Sprite | SpriteCanvas,
	dx: number,
	dy: number,
	dw: number,
	dh: number,
	angle: number,
	hasShadows: boolean,
	shadowShift: number,
	shadowScaleY: number,
	hOff: number,
) {
	if (!sprite || sprite.width <= 0) return;
	dx = Math.floor(dx);
	dy = Math.floor(dy);
	dw = Math.floor(dw);
	dh = Math.floor(dh);
	shadowShift = Math.floor(shadowShift);
	ctx.rotate(angle);
	ctx.drawImage(sprite, dx, dy, dw, dh);
	if (hasShadows && st.settings.showShadows) {
		ctx.globalAlpha = 1;
		ctx.translate(0, shadowShift);
		let tmpShadow = getCachedShadow(sprite, dw, dh + hOff, shadowScaleY);
		if (tmpShadow) {
			ctx.drawImage(tmpShadow, dx, dy + dh);
		}
		ctx.rotate(-angle);
		ctx.translate(0, -shadowShift);
	}
}
var shadowIntensity = 0.16;
function getCachedShadow(
	sprite: Sprite | SpriteCanvas,
	width: number,
	height: number,
	scaleY: number,
) {
	if (cachedShadows[sprite.index!] === undefined && width !== 0 && sprite?.isLoaded) {
		let tmpCanvas = document.createElement("canvas");
		let ctx = tmpCanvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;

		tmpCanvas.width = width;
		tmpCanvas.height = height;
		ctx.globalAlpha = scaleY === 0.5 ? shadowIntensity : shadowIntensity * 0.75;
		ctx.scale(1, -scaleY);
		ctx.transform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(sprite, 0, -height, width, height);
		let imgData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
		let pixelArray = imgData.data;

		for (let i = 0; i < pixelArray.length; i += 4) {
			pixelArray[i] = 0;
			pixelArray[i + 1] = 0;
			pixelArray[i + 2] = 0;
			pixelArray[i + 3] = pixelArray[i + 3]; // ??
		}
		ctx.putImageData(imgData, 0, 0);
		cachedShadows[sprite.index!] = tmpCanvas;
	}
	return cachedShadows[sprite.index!];
}

function callUpdate() {
	requestAnimationFrame(callUpdate);
	currentTime = Date.now();
	updateGameLoop();
}
callUpdate();
