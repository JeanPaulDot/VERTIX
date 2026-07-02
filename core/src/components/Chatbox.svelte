<script module lang="ts">
	import { tick } from "svelte";
	import { st } from "../state.svelte.ts";
	import { TeamColors } from "../utils.ts";

	const refocusCanvas = () =>
		tick().then(() => {
			const mainCanvas = document.getElementById("cvs") as HTMLCanvasElement;
			mainCanvas.focus();
		});

	let currentChatType = $state("ALL");
	function changeChatType() {
		// swap
		currentChatType = currentChatType === "ALL" ? "TEAM" : "ALL";
		refocusCanvas();
	}

	function sendChat(this: HTMLInputElement, event: KeyboardEvent) {
		if (event.key !== "Enter") return;
		if (this.value !== "") {
			st.socket?.emit("cht", this.value.substring(0, 50), currentChatType);
			addChatLine(
				st.player.name,
				(currentChatType === "TEAM" ? "(TEAM) " : "") + this.value + (!st.socket ? " (unsent)" : ""),
				true,
				st.player.team,
			);
			this.value = "";
			refocusCanvas();
		}
	}

	declare global {
		interface Window {
			addChatLine: typeof addChatLine;
		}
	}
	window.addChatLine = addChatLine;
	export function addChatLine(author: string, text: string, fromSelf: boolean, type: string) {
		const source =
			type === "system" || type === "notif" ? type : fromSelf ? "me" : st.player.team === type ? "blue" : "red";

		st.chatLines.push({ text, source, author });

		// arbitrary, so the DOM doesn't grow forever
		if (st.chatLines.length >= 20) st.chatLines.shift();
	}
	const SOURCE_COLORS = {
		red: TeamColors.Red,
		blue: TeamColors.Blue,
		system: "#db4fcd",
		me: "#fff",
		notif: "#fff",
	};
</script>
<ul id="chatList">
	{#each st.chatLines.toReversed() as line}
		<li>
			{#if line.source === "system" || line.source === "notif"}
				<span style:color={SOURCE_COLORS[line.source]}>{line.text}</span>
			{:else}
				<span style:color={SOURCE_COLORS[line.source]}>{line.source === "me" ? "YOU" : line.author}: </span>
				<span>{line.text}</span>
			{/if}
		</li>
	{/each}
</ul>
<div>
	<input
		id="chatInput"
		type="text"
		class="chat-control"
		placeholder="Send Message..."
		maxlength="50"
		onkeydown={sendChat}
	>
	<div id="chatType" class="chat-control" onclick={changeChatType}>{currentChatType}</div>
</div>

<style>
	li {
		padding: 2px;
		margin: 3px;
		word-wrap: break-word;
	}

	#chatList {
		list-style: none;
		display: flex;
		flex-direction: column-reverse;
		width: 250px;
		height: 260px;
		overflow: hidden;
		margin: 0;
		padding: 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 16px;
		-webkit-user-select: text;
		user-select: text;
	}

	.chat-control {
		display: inline-block;
		font-size: 14px;
		pointer-events: auto;
		background: rgba(0, 0, 0, 0.2);
		padding: 8px;
		color: #fff;
		border: none;
	}

	#chatInput {
		width: 250px;
	}

	#chatType {
		margin-left: 5px;
		cursor: pointer;
	}
</style>
