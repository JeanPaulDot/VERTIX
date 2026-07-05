<script lang="ts">
	interface Props {
		text: string;
		kind?: "info" | "error" | "success";
		inline?: boolean;
	}
	const { text, kind = "info", inline = false }: Props = $props();
</script>

{#if text}
	<div class="statusMessage {kind}" class:inline>{text}</div>
{/if}

<style>
	.statusMessage {
		font-size: 12px;
		margin: 4px 0;
		word-wrap: break-word;
		/* messages often carry copyable info (server codes, errors) */
		-webkit-user-select: text;
		user-select: text;
		pointer-events: all;
	}
	.statusMessage.inline {
		display: inline-block;
		margin-left: 5px;
	}
	.statusMessage.info {
		color: var(--gray);
	}
	.statusMessage.error {
		color: var(--red);
	}
	.statusMessage.success {
		color: var(--blue);
	}
</style>
