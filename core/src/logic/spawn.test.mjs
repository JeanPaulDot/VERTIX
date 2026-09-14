// Guards the spawn selector against the two bugs it was written to fix:
// the whole lobby landing on one tile, and an empty candidate list.
import assert from "node:assert/strict";
import { chooseSpawn } from "./spawn.ts";

let passed = 0;
function check(name, fn) {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
}

// a row of four spawn points 100px apart
const tiles = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 200, y: 0 },
	{ x: 300, y: 0 },
];

check("picks the candidate furthest from the only enemy", () => {
	assert.deepEqual(chooseSpawn(tiles, [{ x: 0, y: 0 }]), { x: 300, y: 0 });
	assert.deepEqual(chooseSpawn(tiles, [{ x: 300, y: 0 }]), { x: 0, y: 0 });
});

check("maximises the distance to the NEAREST enemy, not the average", () => {
	// enemies at both ends: the middle tiles are the only sane answer
	const picked = chooseSpawn(tiles, [
		{ x: 0, y: 0 },
		{ x: 300, y: 0 },
	]);
	assert.ok(picked.x === 100 || picked.x === 200, `picked ${picked.x}`);
});

check("the round-start tie does not collapse onto one tile", () => {
	// No enemies alive — every candidate ties. This is the state right after
	// newRound, and it is what used to put every player in the room on tiles[0].
	const seen = new Set();
	for (let i = 0; i < tiles.length; i++) {
		seen.add(chooseSpawn(tiles, [], i).x);
	}
	assert.equal(seen.size, tiles.length, "every start index must reach a different tile");
});

check("start index only breaks ties, never overrides distance", () => {
	// whatever index the scan starts at, an enemy on tile 0 must send us to 300
	for (let i = 0; i < tiles.length; i++) {
		assert.deepEqual(chooseSpawn(tiles, [{ x: 0, y: 0 }], i), { x: 300, y: 0 });
	}
});

check("start index is wrapped, so a stale or negative index is harmless", () => {
	assert.deepEqual(chooseSpawn(tiles, [], 4), chooseSpawn(tiles, [], 0));
	assert.deepEqual(chooseSpawn(tiles, [], -1), chooseSpawn(tiles, [], 3));
	assert.deepEqual(chooseSpawn(tiles, [], 99), chooseSpawn(tiles, [], 3));
});

check("no candidates returns null rather than a bogus position", () => {
	assert.equal(chooseSpawn([], [{ x: 0, y: 0 }]), null);
	assert.equal(chooseSpawn([], []), null);
});

check("a single candidate is returned whatever the enemies are doing", () => {
	const one = [{ x: 42, y: 7 }];
	assert.deepEqual(chooseSpawn(one, []), { x: 42, y: 7 });
	assert.deepEqual(chooseSpawn(one, [{ x: 42, y: 7 }]), { x: 42, y: 7 });
});

check("distance is euclidean, not per-axis", () => {
	const grid = [
		{ x: 0, y: 0 },
		{ x: 30, y: 40 }, // 50 away from the origin
		{ x: 45, y: 0 }, // 45 away — further on x alone, closer overall
	];
	assert.deepEqual(chooseSpawn(grid, [{ x: 0, y: 0 }]), { x: 30, y: 40 });
});

console.log(`${passed} checks passed`);
