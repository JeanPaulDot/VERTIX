<script lang="ts">
	import type { Snippet } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { prefersReducedMotion } from "../../motion.ts";

	interface Props {
		open: boolean;
		title?: string;
		onclose: () => void;
		scrollable?: boolean;
		/** widens the panel for content that needs the room (the social hub) */
		wide?: boolean;
		children: Snippet;
	}
	const {
		open,
		title = "",
		onclose,
		scrollable = true,
		wide = false,
		children,
	}: Props = $props();

	// Transition parameters, not a conditional `transition:` — Svelte needs the
	// directive to be present either way, so reduced motion collapses the
	// duration instead of removing the animation.
	const backdropIn = $derived(prefersReducedMotion() ? { duration: 0 } : { duration: 160 });
	const panelIn = $derived(
		prefersReducedMotion()
			? { duration: 0 }
			: { duration: 220, start: 0.94, opacity: 0, easing: cubicOut },
	);

	// Esc closes. Every modal in the app goes through this shell, so wiring it
	// here is what makes the whole menu dismissable from the keyboard.
	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
	<div class="modalBackdrop" onclick={onclose} transition:fade={backdropIn}>
		<div
			class="modalPanel"
			class:modalScrollable={scrollable}
			class:modalWide={wide}
			onclick={(e) => e.stopPropagation()}
			transition:scale={panelIn}
		>
			<div class="modalHeader">
				{#if title}<h3 class="menuHeader">{title}</h3>{/if}
				<span class="modalCloseX" onclick={onclose} role="button" tabindex="-1">X</span>
			</div>
			<div class="modalContent" class:modalContentScrollable={scrollable}>
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modalBackdrop {
		position: fixed;
		inset: 0;
		/* modals can be mounted inside pointer-events:none overlays (e.g. #startMenuWrapper) */
		pointer-events: auto;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.modalPanel {
		background: var(--white);
		padding: 15px;
		min-width: 300px;
		max-width: 90vw;
		display: flex;
		flex-direction: column;
		box-shadow: inset 0 -5px var(--card-shadow);
	}
	.modalWide {
		width: min(980px, 94vw);
		max-width: 94vw;
	}
	.modalScrollable {
		max-height: 80vh;
	}
	.modalHeader {
		display: flex;
		justify-content: flex-end;
		align-items: center;
	}
	.modalHeader .menuHeader {
		margin: 0;
		margin-right: auto;
	}
	.modalCloseX {
		cursor: pointer;
		color: var(--ink-soft);
		font-size: 16px;
		font-weight: bold;
		line-height: 1;
		padding: 2px 6px;
		flex: none;
		transition: color var(--dur-fast) ease, transform var(--dur-fast) var(--ease-pop);
	}
	.modalCloseX:hover {
		color: var(--ink);
		transform: scale(1.25);
	}
	.modalContent {
		margin-top: 10px;
	}
	.modalContentScrollable {
		overflow-y: auto;
	}
</style>
