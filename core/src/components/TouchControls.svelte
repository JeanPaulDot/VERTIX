<script lang="ts">
	import { st } from "../state.svelte.ts";

	// On-screen controls for touch devices. This is a pure overlay: everything it
	// does goes through window.touchInput, which drives the same `keys` / `target`
	// state the mouse and keyboard drive in app.tsx. No gameplay code forks on
	// st.mobile because of this component.

	const STICK_RADIUS = 58; // px from the stick's centre to full deflection
	const DEAD_ZONE = 0.16; // ignore tiny wobble so standing still is possible
	// how far a fully-deflected aim stick "reaches", in world units. Mirrors the
	// distance a mouse cursor would sit from the player; feeds weapon spread and
	// the camera lead-offset.
	const AIM_REACH = 520;

	type Stick = { id: number; originX: number; originY: number; dx: number; dy: number };

	let moveStick: Stick | null = $state(null);
	let aimStick: Stick | null = $state(null);

	// only mount the controls while actually in a round
	const inRound = $derived(st.gameStart && !st.gameOver);

	function deflection(stick: Stick) {
		const dist = Math.hypot(stick.dx, stick.dy);
		if (dist === 0) return { nx: 0, ny: 0, mag: 0 };
		const clamped = Math.min(dist, STICK_RADIUS);
		return { nx: stick.dx / dist, ny: stick.dy / dist, mag: clamped / STICK_RADIUS };
	}

	function applyMove(stick: Stick | null) {
		if (!stick) return window.touchInput.stopMove();
		const { nx, ny, mag } = deflection(stick);
		if (mag < DEAD_ZONE) return window.touchInput.stopMove();
		// analog: magnitude scales speed, the server normalises direction itself
		window.touchInput.move(nx * mag, ny * mag);
	}

	function applyAim(stick: Stick | null) {
		if (!stick) return;
		const { nx, ny, mag } = deflection(stick);
		if (mag < DEAD_ZONE) {
			window.touchInput.setFiring(false);
			return;
		}
		// target.f points from the aim position back to the player, matching the
		// mouse path in app.tsx (atan2(playerY - mouseY, playerX - mouseX))
		window.touchInput.aim(Math.atan2(-ny, -nx), AIM_REACH * mag);
		// deflecting the aim stick past the dead zone is what fires
		window.touchInput.setFiring(true);
	}

	function startStick(event: PointerEvent, which: "move" | "aim") {
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		const rect = target.getBoundingClientRect();
		const stick: Stick = {
			id: event.pointerId,
			originX: rect.left + rect.width / 2,
			originY: rect.top + rect.height / 2,
			dx: 0,
			dy: 0,
		};
		if (which === "move") {
			moveStick = stick;
			applyMove(stick);
		} else {
			aimStick = stick;
			applyAim(stick);
		}
	}

	function moveStickTo(event: PointerEvent, which: "move" | "aim") {
		const stick = which === "move" ? moveStick : aimStick;
		if (!stick || stick.id !== event.pointerId) return;
		stick.dx = event.clientX - stick.originX;
		stick.dy = event.clientY - stick.originY;
		if (which === "move") applyMove(stick);
		else applyAim(stick);
	}

	function endStick(event: PointerEvent, which: "move" | "aim") {
		const stick = which === "move" ? moveStick : aimStick;
		if (!stick || stick.id !== event.pointerId) return;
		if (which === "move") {
			moveStick = null;
			window.touchInput.stopMove();
		} else {
			aimStick = null;
			window.touchInput.setFiring(false);
		}
	}

	// knob offset, clamped to the stick's radius
	function knobStyle(stick: Stick | null) {
		if (!stick) return "transform: translate(0px, 0px)";
		const dist = Math.hypot(stick.dx, stick.dy);
		const scale = dist > STICK_RADIUS ? STICK_RADIUS / dist : 1;
		return `transform: translate(${stick.dx * scale}px, ${stick.dy * scale}px)`;
	}
</script>

{#if st.mobile && inRound}
	<div id="touchControls">
		<!-- left: movement -->
		<div
			class="touchStick touchStickLeft"
			onpointerdown={(e) => startStick(e, "move")}
			onpointermove={(e) => moveStickTo(e, "move")}
			onpointerup={(e) => endStick(e, "move")}
			onpointercancel={(e) => endStick(e, "move")}
		>
			<div class="touchKnob" style={knobStyle(moveStick)}></div>
		</div>

		<!-- right: aim, and firing while deflected -->
		<div
			class="touchStick touchStickRight"
			onpointerdown={(e) => startStick(e, "aim")}
			onpointermove={(e) => moveStickTo(e, "aim")}
			onpointerup={(e) => endStick(e, "aim")}
			onpointercancel={(e) => endStick(e, "aim")}
		>
			<div class="touchKnob touchKnobAim" style={knobStyle(aimStick)}></div>
		</div>

		<div class="touchButtons">
			<button type="button" class="touchButton" onpointerdown={() => window.touchInput.jump()}>JUMP</button>
			<button type="button" class="touchButton" onpointerdown={() => window.touchInput.reload()}>RELOAD</button>
			<button type="button" class="touchButton" onpointerdown={() => window.touchInput.swapWeapon(1)}>SWAP</button>
		</div>

		<div class="touchTopButtons">
			<button type="button" class="touchButton touchButtonSmall" onpointerdown={() => window.touchInput.openMenu()}>☰</button>
			<button type="button" class="touchButton touchButtonSmall" onpointerdown={() => window.touchInput.toggleScoreboard()}>▤</button>
			<button type="button" class="touchButton touchButtonSmall" onpointerdown={() => window.touchInput.spray()}>◈</button>
		</div>
	</div>
{/if}

<style>
	#touchControls {
		position: fixed;
		inset: 0;
		z-index: 40;
		/* the overlay itself must not eat taps meant for the canvas */
		pointer-events: none;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.touchStick {
		position: absolute;
		bottom: 24px;
		width: 132px;
		height: 132px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.12);
		border: 2px solid rgba(255, 255, 255, 0.28);
		pointer-events: auto;
		touch-action: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.touchStickLeft {
		left: 24px;
	}
	.touchStickRight {
		right: 24px;
	}

	.touchKnob {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.45);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
		will-change: transform;
	}
	.touchKnobAim {
		background: rgba(118, 179, 227, 0.7);
	}

	.touchButtons {
		position: absolute;
		right: 24px;
		bottom: 176px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: auto;
	}
	.touchTopButtons {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		gap: 8px;
		pointer-events: auto;
	}

	.touchButton {
		min-width: 72px;
		min-height: 48px;
		border: 0;
		border-radius: 4px;
		background: rgba(118, 179, 227, 0.85);
		color: #fff;
		font-size: 13px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		touch-action: none;
	}
	.touchButton:active {
		background: rgba(111, 169, 214, 1);
	}
	.touchButtonSmall {
		min-width: 44px;
		min-height: 44px;
		font-size: 18px;
		padding: 0;
	}
</style>
