<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		open: boolean;
		title?: string;
		onclose: () => void;
		scrollable?: boolean;
		children: Snippet;
	}
	const { open, title = "", onclose, scrollable = true, children }: Props = $props();
</script>

{#if open}
	<div class="modalBackdrop" onclick={onclose}>
		<div class="modalPanel" class:modalScrollable={scrollable} onclick={(e) => e.stopPropagation()}>
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
		box-shadow: inset 0 -5px #e0e0e0;
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
		color: rgba(0, 0, 0, 0.4);
		font-size: 16px;
		font-weight: bold;
		line-height: 1;
		padding: 2px 6px;
		flex: none;
	}
	.modalCloseX:hover {
		color: rgba(0, 0, 0, 0.8);
	}
	.modalContent {
		margin-top: 10px;
	}
	.modalContentScrollable {
		overflow-y: auto;
	}
</style>
