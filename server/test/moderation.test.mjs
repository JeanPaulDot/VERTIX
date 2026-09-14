import assert from "node:assert/strict";
import test from "node:test";
import {
	isSanctionActive,
	sanctionSubject,
	expiryFromMinutes,
	canAccess,
	parseRole,
} from "../moderation-core.ts";

// --- isSanctionActive --------------------------------------------------------

test("permanent ban stays active forever", () => {
	assert.equal(isSanctionActive({ active: 1, expires_at: null }, Date.now() + 10 * 365 * 86400000), true);
});

test("timed sanction is active before its expiry", () => {
	const now = Date.now();
	assert.equal(isSanctionActive({ active: 1, expires_at: now + 60_000 }, now), true);
});

test("timed sanction expires exactly at expires_at, not one ms later", () => {
	const now = Date.now();
	assert.equal(isSanctionActive({ active: 1, expires_at: now }, now), false);
	assert.equal(isSanctionActive({ active: 1, expires_at: now - 1 }, now), false);
});

test("lifted sanction is inactive regardless of expiry", () => {
	const now = Date.now();
	assert.equal(isSanctionActive({ active: 0, expires_at: null }, now), false);
	assert.equal(isSanctionActive({ active: 0, expires_at: now + 60_000 }, now), false);
});

// --- sanctionSubject --------------------------------------------------------

test("signed-in player is sanctioned as their account, not their IP", () => {
	assert.deepEqual(sanctionSubject({ userId: 42, ip: "1.2.3.4" }), { kind: "user", value: "42" });
});

test("guest falls back to their IP", () => {
	assert.deepEqual(sanctionSubject({ userId: null, ip: "1.2.3.4" }), { kind: "ip", value: "1.2.3.4" });
});

test("no identity at all cannot be sanctioned", () => {
	assert.equal(sanctionSubject({ userId: null, ip: null }), null);
	assert.equal(sanctionSubject({}), null);
});

// --- expiryFromMinutes ------------------------------------------------------

test("null minutes means permanent (null expiry)", () => {
	assert.equal(expiryFromMinutes(null, Date.now()), null);
	assert.equal(expiryFromMinutes(undefined, Date.now()), null);
});

test("minutes convert to epoch-ms expiry", () => {
	const now = Date.now();
	assert.equal(expiryFromMinutes(60, now), now + 3_600_000);
	assert.equal(expiryFromMinutes(1, now), now + 60_000);
});

test("nonsense durations are treated as permanent rather than instant-expiring", () => {
	// 0/negative/NaN minutes would otherwise produce an already-expired sanction
	// that silently does nothing — permanent is the safe interpretation.
	assert.equal(expiryFromMinutes(0, Date.now()), null);
	assert.equal(expiryFromMinutes(-5, Date.now()), null);
	assert.equal(expiryFromMinutes(Number.NaN, Date.now()), null);
});

// --- canAccess --------------------------------------------------------------

test("admin can do everything", () => {
	for (const action of ["read", "kick", "mute", "tempban", "ban", "unban", "accountEdit", "roomManage", "serverManage", "roleSet", "bugResolve"]) {
		assert.equal(canAccess("admin", action), true, `admin should allow ${action}`);
	}
});

test("mod covers the daily toolbox but nothing structural", () => {
	for (const action of ["read", "kick", "mute", "tempban", "bugResolve"]) {
		assert.equal(canAccess("mod", action), true, `mod should allow ${action}`);
	}
	for (const action of ["ban", "unban", "accountEdit", "roomManage", "serverManage", "roleSet"]) {
		assert.equal(canAccess("mod", action), false, `mod should NOT allow ${action}`);
	}
});

// --- parseRole --------------------------------------------------------------

test("parseRole accepts exactly the three real roles", () => {
	assert.equal(parseRole("mod"), "mod");
	assert.equal(parseRole("admin"), "admin");
	assert.equal(parseRole("player"), "player");
	assert.equal(parseRole("superadmin"), null);
	assert.equal(parseRole(1), null);
	assert.equal(parseRole(null), null);
});
