import { st } from "../state.svelte.ts";
import { randomInt, shadeColor } from "../utils.ts";

const textSizeMult = 0.55;
const bigTextSize = (st.maxScreenHeight / 7.7) * textSizeMult;
const medTextSize = bigTextSize * 0.85;
const textGap = bigTextSize * 1.2;
const bigTextY = st.maxScreenHeight / 4.3;
const NOTIFICATION_FADE_SPEED = 0.003;
const NOTIFICATION_FADE_DELAY = 800;
const ANIM_TEXT_FADE_SPEED = 0.0025;
const MOVING_TEXT_FADE_DELAY = 350;

export class AnimText {
	text = "";
	scaleSpeed = 0;
	minScale = 0;
	maxScale = 0;
	fontSize = 0;
	scale = 0;
	ySpeed = 0;
	xSpeed = 0;
	y = 0;
	x = 0;
	active = false;
	alpha = 1;
	fadeSpeed = 0;
	useStart = false;
	moveDelay = 0;
	fadeDelay = 0;
	removable = false;
	textType = "";
	color = "#fff";
	cachedImage: HTMLCanvasElement | null = null;

	update(delta: number) {
		if (!this.active) return;
		this.scale += this.scaleSpeed * delta;
		if (this.scaleSpeed > 0) {
			if (this.scale >= this.maxScale) {
				this.scale = this.maxScale;
				this.scaleSpeed *= -1;
			}
		} else if (this.scale < this.minScale) {
			this.scale = this.minScale;
			this.scaleSpeed = 0;
		}
		if (this.moveDelay > 0) {
			this.moveDelay -= delta;
		} else {
			this.x += this.xSpeed * delta;
			this.y += this.ySpeed * delta;
		}
		if (this.fadeDelay > 0) {
			this.fadeDelay -= delta;
		} else {
			this.alpha -= this.fadeSpeed * delta;
			if (this.alpha <= 0) {
				this.alpha = 0;
				this.active = false;
			}
		}
	}

	draw() {
		if (!this.active || !this.cachedImage) return;
		window.graph.globalAlpha = this.alpha;
		if (this.useStart) {
			window.graph.drawImage(
				this.cachedImage,
				this.x - st.startX - (this.cachedImage.width / 2) * this.scale,
				this.y - st.startY - (this.cachedImage.height / 2) * this.scale,
				this.cachedImage.width * this.scale,
				this.cachedImage.height * this.scale,
			);
		} else {
			window.graph.drawImage(
				this.cachedImage,
				this.x - (this.cachedImage.width / 2) * this.scale,
				this.y - (this.cachedImage.height / 2) * this.scale,
				this.cachedImage.width * this.scale,
				this.cachedImage.height * this.scale,
			);
		}
	}
}
var notificationsSize = textSizeMult * 80;
var notificationsGap = notificationsSize * 1.6;
var notifications: AnimText[] = [];
for (let i = 0; i < 3; ++i) {
	notifications.push(new AnimText());
}
var notificationIndex = 0;
export function showNotification(text: string) {
	text = text.toUpperCase();
	notificationIndex = (notificationIndex + 1) % notifications.length;
	notifications[notificationIndex].text = text;
	notifications[notificationIndex].alpha = 1;
	notifications[notificationIndex].x = st.maxScreenWidth / 2;
	notifications[notificationIndex].fadeSpeed = NOTIFICATION_FADE_SPEED;
	notifications[notificationIndex].fadeDelay = NOTIFICATION_FADE_DELAY;
	notifications[notificationIndex].fontSize = notificationsSize * st.viewMult;
	notifications[notificationIndex].scale = 1;
	notifications[notificationIndex].scaleSpeed = 0.005;
	notifications[notificationIndex].minScale = 1;
	notifications[notificationIndex].maxScale = 1.5;
	notifications[notificationIndex].cachedImage = renderShadedAnimText(
		text,
		notificationsSize * st.viewMult,
		"#ffffff",
		7,
		"Italic ",
	);
	notifications[notificationIndex].active = true;
	positionNotifications();
}
var activeNotifications = 0;
export function positionNotifications() {
	activeNotifications = 0;
	for (let i = 0; i < notifications.length; ++i) {
		if (notifications[i].active) {
			activeNotifications++;
		}
	}
	if (activeNotifications > 0) {
		notifications.sort(sortByAlpha);
		let b = 0;
		const yBase = st.maxScreenHeight - notifications.length * notificationsGap * st.viewMult - 100;
		for (let i = 0; i < notifications.length; ++i) {
			if (notifications[i].active) {
				notifications[i].y = yBase + notificationsGap * st.viewMult * b;
				b++;
			}
		}
	}
}
export function sortByAlpha(a: AnimText, b: AnimText) {
	if (a.alpha < b.alpha) {
		return 1;
	} else if (b.alpha < a.alpha) {
		return -1;
	} else {
		return 0;
	}
}
export function updateNotifications(delta: number) {
	window.graph.fillStyle = "#fff";
	for (let i = 0; i < notifications.length; ++i) {
		if (notifications[i].active) {
			notifications[i].update(delta);
			notifications[i].draw();
		}
	}
	window.graph.globalAlpha = 1;
}
var animTexts: AnimText[] = [];
for (let i = 0; i < 20; i++) {
	animTexts.push(new AnimText());
}

export function updateAnimTexts(delta: number) {
	window.graph.lineJoin = "round";
	window.graph.textAlign = "center";
	window.graph.textBaseline = "middle";
	for (let i = 0; i < animTexts.length; i++) {
		animTexts[i].update(delta);
		if (animTexts[i].active) {
			animTexts[i].draw();
		}
	}
	window.graph.globalAlpha = 1;
}
export function getReadyAnimText() {
	for (let i = 0; i < animTexts.length; ++i) {
		if (!animTexts[i].active) {
			return animTexts[i];
		}
	}
	return null;
}
type ClassProperties<C> = {
	// biome-ignore lint/complexity/noBannedTypes: intended
	[Key in keyof C as C[Key] extends Function ? never : Key]: C[Key];
};
function startAnimText(
	opts: Partial<ClassProperties<AnimText>>,
	layerCount: number,
	fontExtra: string,
) {
	const tmpText = getReadyAnimText();
	if (!tmpText) return;
	Object.assign(tmpText, opts);
	tmpText.text = tmpText.text.toUpperCase();
	tmpText.fontSize *= st.viewMult;
	tmpText.scale = 1;
	tmpText.maxScale = 1.6;
	tmpText.minScale = 1;
	tmpText.alpha ??= 1;
	tmpText.cachedImage = renderShadedAnimText(
		tmpText.text,
		tmpText.fontSize,
		tmpText.color,
		layerCount,
		fontExtra,
	);
	tmpText.active = true;
}
export function startBigAnimText(
	text: string,
	secondaryText: string,
	delay: number,
	doScale: boolean,
	color: string,
	secondaryColor: string,
	removable: boolean,
	fontSizeMult: number,
) {
	if (!deactiveAnimTexts("big")) return;
	if (text.length > 0) {
		startAnimText(
			{
				text,
				x: st.maxScreenWidth / 2,
				y: bigTextY,
				xSpeed: 0,
				ySpeed: -0.1,
				fadeSpeed: ANIM_TEXT_FADE_SPEED,
				fontSize: bigTextSize * fontSizeMult,
				scaleSpeed: doScale ? 0.005 : 0,
				useStart: false,
				fadeDelay: delay,
				removable: removable,
				moveDelay: delay,
				alpha: 1,
				color: color,
				textType: "big",
			},
			8,
			"Italic ",
		);
	}
	if (secondaryText.length > 0) {
		startAnimText(
			{
				text: secondaryText,
				x: st.maxScreenWidth / 2,
				y: bigTextY + textGap * st.viewMult * fontSizeMult,
				xSpeed: 0,
				ySpeed: -0.04,
				fadeSpeed: ANIM_TEXT_FADE_SPEED,
				fontSize: (medTextSize / 2) * fontSizeMult,
				scaleSpeed: doScale ? 0.003 : 0,
				useStart: false,
				fadeDelay: delay,
				removable: removable,
				moveDelay: delay,
				alpha: 1,
				color: secondaryColor,
				textType: "big",
			},
			8,
			"Italic ",
		);
	}
}
export function startMovingAnimText(
	text: string,
	x: number,
	y: number,
	color: string,
	extraFontSize: number,
) {
	x += randomInt(-25, 25);
	y += randomInt(-20, 5);
	startAnimText(
		{
			text: text,
			x: x,
			y: y,
			xSpeed: 0,
			ySpeed: -0.15,
			fadeSpeed: ANIM_TEXT_FADE_SPEED,
			fontSize: st.maxScreenHeight / 26 + extraFontSize,
			scaleSpeed: 0.005,
			useStart: true,
			fadeDelay: MOVING_TEXT_FADE_DELAY,
			removable: false,
			moveDelay: 0,
			alpha: 1,
			color: color,
			textType: "moving",
		},
		5,
		"",
	);
}
function deactiveAnimTexts(type: string) {
	for (let i = 0; i < animTexts.length; ++i) {
		if (!animTexts[i].active) continue;
		if (animTexts[i].removable) {
			animTexts[i].active = false;
		} else if (animTexts[i].textType === type) {
			return false;
		}
	}
	return true;
}
export function deactiveAllAnimTexts() {
	for (let i = 0; i < animTexts.length; ++i) {
		animTexts[i].active = false;
	}
}
var cachedTextRenders: Record<string, HTMLCanvasElement> = {};
export function renderShadedAnimText(
	text: string,
	fontSize: number,
	color: string,
	layerCount: number,
	fontExtra: string,
) {
	let tmpIndex = `${text}${fontSize}${color}${layerCount}${fontExtra}`;
	let cachedText = cachedTextRenders[tmpIndex];
	if (cachedText === undefined) {
		let tmpCanvas = document.createElement("canvas");
		let ctx = tmpCanvas.getContext("2d");
		if (ctx === null) throw new Error("failed to get canvas ctx");
		const renderFont = `${fontExtra + fontSize}px mainFont`;

		ctx.imageSmoothingEnabled = false;

		ctx.textAlign = "center";
		ctx.font = renderFont;
		tmpCanvas.width = ctx.measureText(text).width * 1.08;
		tmpCanvas.height = fontSize * 1.8 + layerCount;
		const centerX = tmpCanvas.width / 2;
		const centerY = tmpCanvas.height / 2;
		ctx.fillStyle = shadeColor(color, -18);
		ctx.font = renderFont;
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		for (let i = 1; i < layerCount; ++i) {
			ctx.fillText(text, centerX, centerY + i);
		}
		ctx.fillStyle = color;
		ctx.fillText(text, centerX, centerY);
		cachedText = tmpCanvas;
		cachedTextRenders[tmpIndex] = cachedText;
	}
	return cachedText;
}
