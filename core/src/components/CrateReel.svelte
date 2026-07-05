<script lang="ts">
	import { st } from "../state.svelte.ts";
	import type { CrateWonItem } from "../state.svelte.ts";
	import {
		getCosmeticImageUrl,
		getItemRarityColor,
		getItemRarityName,
		getItemRarityTier,
		randomInt,
	} from "../utils.ts";

	interface Props {
		won: CrateWonItem;
		onDone: () => void;
	}
	const { won, onDone }: Props = $props();

	const ITEM_WIDTH = 110; // must match .reelItem width + margins in CSS below
	const REEL_LENGTH = 56;
	const LAND_INDEX = 48; // leaves a tail of items after the winner so the reel doesn't run out mid-spin
	const SPIN_DURATION_MS = 6200;

	type ReelItem = { type: "hat" | "shirt" | "camo"; id: number; name: string; chance: number };

	const wonItem: ReelItem = {
		type: won.itemType,
		id: won.itemId,
		name: won.itemName,
		chance: won.chance,
	};

	function buildPool(): ReelItem[] {
		const pool: ReelItem[] = [];
		for (const h of st.cosmetics.hats)
			if (h.chance > 0) pool.push({ type: "hat", id: h.id, name: h.name, chance: h.chance });
		for (const s of st.cosmetics.shirts)
			if (s.chance > 0) pool.push({ type: "shirt", id: s.id, name: s.name, chance: s.chance });
		for (const c of st.cosmetics.camos[0] ?? [])
			if (c.chance > 0) pool.push({ type: "camo", id: c.id, name: c.name, chance: c.chance });
		return pool.length > 0 ? pool : [wonItem];
	}

	const pool = buildPool();
	const reelItems: ReelItem[] = [];
	for (let i = 0; i < REEL_LENGTH; i++) {
		reelItems.push(i === LAND_INDEX ? wonItem : pool[randomInt(0, pool.length - 1)]);
	}
	// small random offset so the winner never lands in the exact same spot under the marker
	const jitter = randomInt(-Math.floor(ITEM_WIDTH * 0.3), Math.floor(ITEM_WIDTH * 0.3));
	const landOffset = LAND_INDEX * ITEM_WIDTH + ITEM_WIDTH / 2 + jitter;

	const rarityColor = getItemRarityColor(won.chance);
	const rarityTier = getItemRarityTier(won.chance);
	const rarityName = getItemRarityName(won.chance);
	// a handful of sparkles for the flashier tiers (epic/legendary)
	const sparkles = rarityTier >= 3 ? Array.from({ length: rarityTier === 4 ? 10 : 6 }) : [];

	let offset = $state(0);
	let spinning = $state(true);
	let revealed = $state(false);
	let trackEl: HTMLDivElement | undefined = $state();
	let viewportEl: HTMLDivElement | undefined = $state();
	// the marker sits at the viewport's horizontal center; the track transform
	// must be in px relative to that (a translateX percentage would be relative
	// to the 6000px+ track itself and land the winner far off-screen)
	let viewportHalf = $state(170);

	function reveal() {
		if (revealed) return;
		spinning = false;
		revealed = true;
	}

	$effect(() => {
		if (viewportEl) viewportHalf = viewportEl.clientWidth / 2;
		let frame2 = 0;
		const frame = requestAnimationFrame(() => {
			// force a layout with the starting transform committed, then start the
			// spin on the NEXT frame — otherwise the browser can batch start and
			// end transforms into one paint and skip the transition entirely
			trackEl?.getBoundingClientRect();
			frame2 = requestAnimationFrame(() => {
				offset = landOffset;
			});
		});
		// transitionend drives the reveal so it always lines up with where the track visually stops;
		// the timeout is only a fallback in case the event doesn't fire (e.g. a throttled background tab)
		const fallback = setTimeout(reveal, SPIN_DURATION_MS + 500);
		const onTransitionEnd = (e: TransitionEvent) => {
			if (e.propertyName === "transform") reveal();
		};
		trackEl?.addEventListener("transitionend", onTransitionEnd);
		return () => {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(frame2);
			clearTimeout(fallback);
			trackEl?.removeEventListener("transitionend", onTransitionEnd);
		};
	});
</script>

<div class="crateReel" class:reelDone={revealed}>
	<div class="reelMarker"></div>
	<div class="reelViewport" bind:this={viewportEl}>
		<div
			class="reelTrack"
			bind:this={trackEl}
			style:transform={`translateX(${viewportHalf - offset}px)`}
			style:transition={spinning ? `transform ${SPIN_DURATION_MS - 200}ms cubic-bezier(0.15, 0.85, 0.25, 1)` : "none"}
		>
			{#each reelItems as item, i}
				{@const color = getItemRarityColor(item.chance)}
				<div
					class="reelItem"
					class:reelItemWinner={revealed && i === LAND_INDEX}
					style:border-color={color}
				>
					<img class="reelItemImg" src={getCosmeticImageUrl(item.type, item.id)} alt="" draggable="false">
					<div class="reelItemName" style:color>{item.name}</div>
				</div>
			{/each}
		</div>
	</div>
</div>

{#if revealed}
	<div
		class={`reveal reveal-tier${rarityTier}`}
		style:--rarity={rarityColor}
	>
		<div class="revealStage">
			{#if rarityTier >= 2}
				<div class="rays"></div>
			{/if}
			<div class="revealImgWrap">
				<img class="revealImg" src={getCosmeticImageUrl(won.itemType, won.itemId)} alt={won.itemName} draggable="false">
			</div>
			{#each sparkles as _, i}
				<span
					class="sparkle"
					style:--i={i}
					style:--n={sparkles.length}
				></span>
			{/each}
		</div>
		<div class="rarityLabel" style:color={rarityColor}>{rarityName}</div>
		<div class="revealName" style:color={rarityColor}><b>{won.itemName}</b></div>
		<button type="button" class="smallMenuButton" onclick={onDone}>CONTINUE</button>
	</div>
{/if}

<style>
	.crateReel {
		position: relative;
		width: 340px;
		max-width: 80vw;
		margin: 4px auto 10px;
		transition: opacity 250ms ease, max-height 250ms ease;
	}
	/* fade the reel out once the prize is revealed so the reward card takes focus */
	.reelDone {
		opacity: 0.35;
	}
	.reelViewport {
		overflow: hidden;
		height: 104px;
		background: #f2f2f2;
		border: 1px solid #ddd;
		border-radius: 3px;
	}
	.reelTrack {
		display: flex;
		height: 100%;
		will-change: transform;
	}
	.reelItem {
		flex: 0 0 auto;
		width: 94px;
		margin: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 4px;
		background: var(--white);
		border: 2px solid;
		border-radius: 2px;
		box-sizing: border-box;
	}
	.reelItemImg {
		width: 52px;
		height: 52px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.reelItemName {
		font-size: 10px;
		font-weight: bold;
		text-align: center;
		line-height: 1.1;
		max-height: 22px;
		overflow: hidden;
	}
	.reelItemWinner {
		box-shadow: 0 0 12px 2px currentColor;
	}
	.reelMarker {
		position: absolute;
		left: 50%;
		top: -6px;
		bottom: -6px;
		width: 2px;
		background: #333;
		transform: translateX(-50%);
		z-index: 2;
		pointer-events: none;
	}
	.reelMarker::before,
	.reelMarker::after {
		content: "";
		position: absolute;
		left: 50%;
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		transform: translateX(-50%);
	}
	.reelMarker::before {
		top: -6px;
		border-top: 8px solid #333;
	}
	.reelMarker::after {
		bottom: -6px;
		border-bottom: 8px solid #333;
	}

	/* ---- reveal card ---- */
	.reveal {
		min-width: 240px;
		text-align: center;
		animation: pop 400ms cubic-bezier(0.2, 1.5, 0.4, 1) both;
	}
	.revealStage {
		position: relative;
		width: 140px;
		height: 140px;
		margin: 0 auto 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.revealImgWrap {
		position: relative;
		z-index: 2;
		width: 104px;
		height: 104px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 2px solid var(--rarity);
		background: rgba(0, 0, 0, 0.04);
		box-shadow: 0 0 var(--glow, 8px) var(--rarity);
		animation: glow var(--glowSpeed, 1600ms) ease-in-out infinite;
	}
	.revealImg {
		width: 84px;
		height: 84px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.rays {
		position: absolute;
		z-index: 1;
		width: 220px;
		height: 220px;
		border-radius: 50%;
		background: repeating-conic-gradient(
			var(--rarity) 0deg 8deg,
			transparent 8deg 24deg
		);
		opacity: var(--rayOpacity, 0.18);
		mask-image: radial-gradient(closest-side, transparent 34%, #000 42%, #000 70%, transparent 100%);
		-webkit-mask-image: radial-gradient(closest-side, transparent 34%, #000 42%, #000 70%, transparent 100%);
		animation: spinRays var(--raySpeed, 14s) linear infinite;
	}
	.sparkle {
		position: absolute;
		z-index: 3;
		left: 50%;
		top: 50%;
		width: 8px;
		height: 8px;
		margin: -4px 0 0 -4px;
		border-radius: 50%;
		background: var(--rarity);
		box-shadow: 0 0 6px var(--rarity);
		/* fan each sparkle out to its own angle around the item */
		transform: rotate(calc(var(--i) * (360deg / var(--n)))) translateY(-64px);
		animation: sparkle 1400ms ease-in-out infinite;
		animation-delay: calc(var(--i) * 120ms);
	}
	.rarityLabel {
		font-size: 12px;
		font-weight: bold;
		letter-spacing: 2px;
		text-transform: uppercase;
		margin-top: 2px;
	}
	.revealName {
		font-size: 20px;
		margin: 2px 0 10px;
	}

	/* rarity-scaled intensity: rarer items glow harder, rays spin faster, card reacts more */
	.reveal-tier0 .revealImgWrap { --glow: 6px; --glowSpeed: 2200ms; }
	.reveal-tier1 .revealImgWrap { --glow: 12px; --glowSpeed: 2000ms; }
	.reveal-tier2 { --rayOpacity: 0.14; --raySpeed: 18s; }
	.reveal-tier2 .revealImgWrap { --glow: 18px; --glowSpeed: 1700ms; }
	.reveal-tier3 { --rayOpacity: 0.22; --raySpeed: 12s; }
	.reveal-tier3 .revealImgWrap { --glow: 26px; --glowSpeed: 1300ms; }
	.reveal-tier4 { --rayOpacity: 0.32; --raySpeed: 8s; }
	.reveal-tier4 .revealImgWrap {
		--glow: 36px;
		--glowSpeed: 950ms;
		animation: glow 950ms ease-in-out infinite, wiggle 2400ms ease-in-out infinite;
	}

	@keyframes pop {
		0% { transform: scale(0.6); opacity: 0; }
		100% { transform: scale(1); opacity: 1; }
	}
	@keyframes glow {
		0%, 100% { box-shadow: 0 0 calc(var(--glow) * 0.5) var(--rarity); }
		50% { box-shadow: 0 0 var(--glow) var(--rarity); }
	}
	@keyframes spinRays {
		to { transform: rotate(360deg); }
	}
	@keyframes sparkle {
		0%, 100% { opacity: 0; transform: rotate(calc(var(--i) * (360deg / var(--n)))) translateY(-52px) scale(0.4); }
		50% { opacity: 1; transform: rotate(calc(var(--i) * (360deg / var(--n)))) translateY(-72px) scale(1); }
	}
	@keyframes wiggle {
		0%, 92%, 100% { transform: rotate(0deg); }
		94% { transform: rotate(-4deg); }
		96% { transform: rotate(4deg); }
		98% { transform: rotate(-2deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.reveal, .revealImgWrap, .rays, .sparkle { animation: none !important; }
	}
</style>
