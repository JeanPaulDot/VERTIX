<script lang="ts">
	import { st } from "../state.svelte.ts";

	let message = $state("");
	let status = $state<"idle" | "sending" | "sent" | "error">("idle");

	async function submit() {
		const text = message.trim();
		if (!text || status === "sending") return;
		status = "sending";
		try {
			const res = await fetch("/api/bugReport", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: text, room: st.room ?? "" }),
			});
			if (!res.ok) {
				status = "error";
				return;
			}
			message = "";
			status = "sent";
		} catch {
			status = "error";
		}
	}
</script>

<h3 class="menuHeaderTabbed2">REPORT A BUG</h3>
<p>Describe what went wrong — it goes straight to the server admin.</p>
<textarea
	placeholder="What happened? (steps, room, mode...)"
	maxlength="2000"
	bind:value={message}
	rows={5}
></textarea>
<button type="button" onclick={submit} disabled={status === "sending"}>
	{status === "sending" ? "SENDING..." : "SUBMIT"}
</button>
{#if status === "sent"}
	<p class="ok">Thanks! Your report was sent.</p>
{:else if status === "error"}
	<p class="err">Couldn't send the report. Please try again later.</p>
{/if}

<style>
	h3 {
		margin-top: 0;
	}
	p {
		font-size: 13px;
		color: rgba(0, 0, 0, 0.6);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		min-height: 90px;
		padding: 8px;
		border: solid 1px #ccc;
		border-radius: 2px;
		font: inherit;
		resize: vertical;
		margin-bottom: 10px;
	}
	button {
		cursor: pointer;
		background: #76b3e3;
		border: 0;
		box-shadow: inset 0 -3px #6fa9d6;
		color: #fff;
		padding: 8px 16px;
		border-radius: 2px;
		font-weight: bold;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ok {
		color: #3a9d5d;
	}
	.err {
		color: #c05050;
	}
</style>
