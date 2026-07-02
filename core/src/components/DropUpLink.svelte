<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		title: string;
		children: Snippet;
	}
	const { title, children }: Props = $props();

	const id = $props.id();
</script>
<div class="dropUpLink">
	<button popovertarget={id}>{title}</button>
	<ul {id} class="dropdown" popover="hint">
		{@render children()}
	</ul>
</div>
<style>
	.dropUpLink {
		position: relative;
		display: inline-block;
		color: var(--blue);
	}
	.dropUpLink .dropdown {
		position: absolute;
		padding: 5px;
		margin: 0px 0px 10px 0px;
		list-style-type: none;
		background-color: #fff;
		border-radius: 1px 1px 1px 1px;
	}

	[popover] {
		position-area: top;
		border: none;
	}

	[popovertarget] {
		background: none;
		color: inherit;
		border: none;
		padding: 0;
		font: inherit;
		outline: inherit;
		cursor: pointer;
	}
</style>
