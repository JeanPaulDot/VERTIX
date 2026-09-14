// Exercises the remote-player interpolation against a simulated network trace.
// Run with: node --experimental-strip-types interp.test.mjs
import assert from "node:assert/strict";
import {
	sampleSnapshots,
	pruneSnapshots,
	interpolateAngle,
} from "./interpolation.ts";

const DELAY = 100;
const EXTRAP = 150;
let passed = 0;
function check(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

// --- A trace that mimics the real thing: a player walking at 0.3 px/ms, with
// server ticks every 16ms and realistic arrival jitter (we measured 15-32ms).
const SPEED = 0.3;
const buffer = [];
let t = 1000;
for (let i = 0; i < 40; i++) {
	buffer.push({ t, x: Math.round((t - 1000) * SPEED), y: 500, angle: 90, jumpY: 0 });
	t += 16 + (i % 3 === 0 ? 10 : 0); // jitter
}
const newest = buffer.at(-1).t;

check("interpolates strictly between snapshots", () => {
	const a = sampleSnapshots(buffer, buffer[5].t, EXTRAP);
	const b = sampleSnapshots(buffer, (buffer[5].t + buffer[6].t) / 2, EXTRAP);
	const c = sampleSnapshots(buffer, buffer[6].t, EXTRAP);
	assert.equal(a.x, buffer[5].x);
	assert.equal(c.x, buffer[6].x);
	assert.ok(b.x > a.x && b.x < c.x, `midpoint ${b.x} not between ${a.x} and ${c.x}`);
});

check("every render frame moves (the stutter fix)", () => {
	// 144Hz rendering against a 16ms server tick: the old code assigned position
	// on packet arrival, so most frames saw no movement at all.
	const frames = [];
	for (let rt = buffer[2].t; rt < newest - DELAY; rt += 1000 / 144) {
		frames.push(sampleSnapshots(buffer, rt, EXTRAP).x);
	}
	const steps = frames.slice(1).map((x, i) => x - frames[i]);
	const still = steps.filter((d) => d === 0).length;
	assert.ok(frames.length > 20, `only ${frames.length} frames sampled`);
	assert.equal(still, 0, `${still}/${steps.length} frames had zero movement`);
	// and the motion is even — no frame jumps more than 3x the median step
	const sorted = [...steps].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];
	const worst = Math.max(...steps);
	assert.ok(worst < median * 3, `uneven: worst step ${worst} vs median ${median}`);
});

check("rendered speed stays above the animation threshold", () => {
	// REMOTE_MOVING_THRESHOLD in app.tsx is 0.01 px/ms; a walking player must
	// clear it on every frame or the walk cycle drops back to the idle sprite.
	const dt = 1000 / 144;
	let below = 0;
	let previous = sampleSnapshots(buffer, buffer[2].t, EXTRAP).x;
	for (let rt = buffer[2].t + dt; rt < newest - DELAY; rt += dt) {
		const x = sampleSnapshots(buffer, rt, EXTRAP).x;
		if (Math.abs(x - previous) / dt <= 0.01) below++;
		previous = x;
	}
	assert.equal(below, 0, `${below} frames fell below the moving threshold`);
});

check("holds position when the buffer runs dry, then stops drifting", () => {
	const short = buffer.slice(0, 3);
	const last = short.at(-1);
	const near = sampleSnapshots(short, last.t + 50, EXTRAP);
	const far = sampleSnapshots(short, last.t + 5000, EXTRAP);
	assert.ok(near.x > last.x, "should extrapolate briefly");
	// capped at EXTRAP ms of extrapolation, so 5s out lands no further than 150ms out
	const capped = sampleSnapshots(short, last.t + EXTRAP, EXTRAP);
	assert.equal(far.x, capped.x, "extrapolation is not capped");
});

check("clamps to the oldest sample rather than guessing backwards", () => {
	const pose = sampleSnapshots(buffer, buffer[0].t - 5000, EXTRAP);
	assert.equal(pose.x, buffer[0].x);
});

check("returns null on an empty buffer", () => {
	assert.equal(sampleSnapshots([], 123, EXTRAP), null);
});

check("carries jumpY so remote jumps render", () => {
	const jump = [
		{ t: 0, x: 0, y: 0, angle: 0, jumpY: 0 },
		{ t: 100, x: 0, y: 0, angle: 0, jumpY: 80 },
	];
	assert.equal(sampleSnapshots(jump, 50, EXTRAP).jumpY, 40);
});

check("angle takes the short way around 0/360", () => {
	assert.equal(interpolateAngle(350, 10, 0.5), 360);
	assert.equal(interpolateAngle(10, 350, 0.5), 0);
	assert.equal(interpolateAngle(0, 180, 0.5), 90);
});

check("prune keeps enough to interpolate", () => {
	const b = buffer.map((s) => ({ ...s }));
	pruneSnapshots(b, newest, 100);
	assert.ok(b.length >= 2, "pruned below an interpolatable pair");
	assert.ok(b.length < buffer.length, "pruned nothing");
	assert.ok(sampleSnapshots(b, newest - DELAY, EXTRAP) !== null);
});

check("buffer never grows without bound under prune", () => {
	const b = [];
	for (let i = 0; i < 500; i++) {
		b.push({ t: i * 16, x: i, y: 0, angle: 0, jumpY: 0 });
		pruneSnapshots(b, i * 16 - DELAY, 500);
	}
	assert.ok(b.length < 60, `buffer grew to ${b.length}`);
});

console.log(`\n${passed} checks passed`);
