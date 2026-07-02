<script lang="ts">
	import { st } from "../state.svelte.ts";

	$effect(() => {
		// don't save if the user is in the middle of selecting a new keybind
		if (Object.values(st.keysList).includes(null!)) return;

		localStorage.setItem("keysList", JSON.stringify(st.keysList));
	});

	function inputReset() {
		st.keysList = {
			upKey: "KeyW",
			downKey: "KeyS",
			leftKey: "KeyA",
			rightKey: "KeyD",
			reloadKey: "KeyR",
			jumpKey: "Space",
			sprayKey: "KeyF",
			leaderboardKey: "ShiftLeft",
			chatToggleKey: "Enter",
			incWeapKey: "KeyE",
			decWeapKey: "KeyQ",
		};
	}

	function getKeyInput(control: keyof typeof st.keysList) {
		st.keysList[control] = null!;
		document.addEventListener(
			"keydown",
			(event) => {
				event.preventDefault();
				st.keysList[control] = event.code;
			},
			{ once: true },
		);
	}
</script>

<!-- could be better organized, but this is a start -->
<div id="top">
	<div class="inputSelectItem" onclick={() => inputReset()}><b>Reset to Default</b></div>
	<h2>Movement</h2>
	<div>
		<b>Up:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("upKey")}>{st.keysList.upKey ?? "Press any Key"}</div>
	</div>
	<div>
		<b>Down:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("downKey")}>{st.keysList.downKey ?? "Press any Key"}</div>
	</div>
	<div>
		<b>Left:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("leftKey")}>{st.keysList.leftKey ?? "Press any Key"}</div>
	</div>
	<div>
		<b>Right:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("rightKey")}>{st.keysList.rightKey ?? "Press any Key"}</div>
	</div>
	<div>
		<b>Jump:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("jumpKey")}>{st.keysList.jumpKey ?? "Press any Key"}</div>
	</div>
	<h2>Combat</h2>
	<div>
		<b>Aim:</b>
		<div class="inputSelectItem">Mouse</div>
	</div>
	<div>
		<b>Shoot:</b>
		<div class="inputSelectItem">Left-Mouse</div>
	</div>
	<div>
		<b>Change Weapon:</b>
		<div class="inputSelectItem">Scroll-Mouse</div>
	</div>
	<div>
		<b>Next Weapon:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("incWeapKey")}>
			{st.keysList.incWeapKey ?? "Press any Key"}
		</div>
	</div>
	<div>
		<b>Previous Weapon:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("decWeapKey")}>
			{st.keysList.decWeapKey ?? "Press any Key"}
		</div>
	</div>
	<div>
		<b>Reload:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("reloadKey")}>
			{st.keysList.reloadKey ?? "Press any Key"}
		</div>
	</div>
	<h2>Other</h2>
	<div>
		<b>Spray:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("sprayKey")}>{st.keysList.sprayKey ?? "Press any Key"}</div>
	</div>
	<div>
		<b>View Stats:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("leaderboardKey")}>
			{st.keysList.leaderboardKey ?? "Press any Key"}
		</div>
	</div>
	<div>
		<b>Toggle Chat:</b>
		<div class="inputSelectItem" onclick={() => getKeyInput("chatToggleKey")}>
			{st.keysList.chatToggleKey ?? "Press any Key"}
		</div>
	</div>
	<br>
	Check the
	<a href="https://www.reddit.com/r/VertixOnline/wiki/index"> Wiki </a>
	for more info.
</div>

<style>
	.inputSelectItem {
		display: inline-block;
		font-size: 12px;
		padding: 5px;
		cursor: pointer;
		position: relative;
	}

	.inputSelectItem:hover {
		background: rgba(0, 0, 0, 0.1);
		font-size: 14px;
	}

	#top {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.4);
	}
</style>
