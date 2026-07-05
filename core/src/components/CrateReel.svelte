<script lang="ts">
	import { st } from "../state.svelte.ts";
	import { getItemRarityColor, randomInt } from "../utils.ts";

	interface Props {
		won: { itemName: string; chance: number };
		onDone: () => void;
	}
	const { won, onDone }: Props = $props();

	const ITEM_WIDTH = 110; // must match .reelItem width + margins in CSS below
	const REEL_LENGTH = 56;
	const LAND_INDEX = 48; // leaves a tail of items after the winner so the reel doesn't run out mid-spin
	const SPIN_DURATION_MS = 6200;

	type ReelItem = { name: string; chance: number };

	function buildPool(): ReelItem[] {
		const pool: ReelItem[] = [];
		for (const h of st.cosmetics.hats) if (h.chance > 0) pool.push({ name: h.name, chance: h.chance });
		for (const s of st.cosmetics.shirts) if (s.chance > 0) pool.push({ name: s.name, chance: s.chance });
		for (const c of st.cosmetics.camos[0] ?? []) if (c.chance > 0) pool.push({ name: c.name, chance: c.chance });
		return pool.length > 0 ? pool : [{ name: won.itemName, chance: won.chance }];
	}

	const pool = buildPool();
	const reelItems: ReelItem[] = [];
	for (let i = 0; i < REEL_LENGTH; i++) {
		reelItems.push(
			i === LAND_INDEX ? { name: won.itemName, chance: won.chance } : pool[randomInt(0, pool.length - 1)],
		);
	}
	// small random offset so the winner never lands in the exact same spot under the marker
	const jitter = randomInt(-Math.floor(ITEM_WIDTH * 0.3), Math.floor(ITEM_WIDTH * 0.3));
	const landOffset = LAND_INDEX * ITEM_WIDTH + ITEM_WIDTH / 2 + jitter;

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

<div class="crateReel">
	<div class="reelMarker"></div>
	<div class="reelViewport" bind:this={viewportEl}>
		<div
			class="reelTrack"
			bind:this={trackEl}
			style:transform={`translateX(${viewportHalf - offset}px)`}
			style:transition={spinning ? `transform ${SPIN_DURATION_MS - 200}ms cubic-bezier(0.61, 1, 0.88, 1)` : "none"}
		>
			{#each reelItems as item, i}
				<div
					class="reelItem"
					class:reelItemWinner={revealed && i === LAND_INDEX}
					style:color={getItemRarityColor(item.chance)}
					style:border-color={getItemRarityColor(item.chance)}
				>
					{item.name}
				</div>
			{/each}
		</div>
	</div>
</div>

{#if revealed}
	<div class="rewardBody">
		<p>You got:</p>
		<div class="rewardItem" style:color={getItemRarityColor(won.chance)}>
			<b>{won.itemName}</b>
		</div>
		<button type="button" class="smallMenuButton" onclick={onDone}>CONTINUE</button>
	</div>
{/if}

<style>
	.crateReel {
		position: relative;
		width: 340px;
		max-width: 80vw;
		margin: 4px auto 10px;
	}
	.reelViewport {
		overflow: hidden;
		height: 70px;
		background: #f2f2f2;
		border: 1px solid #ddd;
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
		align-items: center;
		justify-content: center;
		text-align: center;
		font-size: 11px;
		font-weight: bold;
		padding: 4px;
		background: var(--white);
		border: 2px solid;
		border-radius: 2px;
		box-sizing: border-box;
	}
	.reelItemWinner {
		box-shadow: 0 0 10px 2px currentColor;
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
	.rewardBody {
		min-width: 220px;
		text-align: center;
	}
	.rewardItem {
		padding: 10px;
		font-size: 18px;
		text-align: center;
	}
</style>
