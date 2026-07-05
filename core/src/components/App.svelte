<script lang="ts">
	import { st } from "../state.svelte.ts";
	import { getCurrentWeapon } from "../utils.ts";
	import AccountChip from "./AccountChip.svelte";
	import AccountWidget from "./AccountWidget.svelte";
	import ActionBar from "./ActionBar.svelte";
	import Chatbox from "./Chatbox.svelte";
	import Controls from "./Controls.svelte";
	import GameStatsTable from "./GameStatsTable.svelte";
	import LoadoutCard from "./LoadoutCard.svelte";
	import Modal from "./common/Modal.svelte";
	import RewardPopup from "./RewardPopup.svelte";
	import RoomList from "./RoomList.svelte";
	import Settings from "./Settings.svelte";
	import StartMenu from "./StartMenu.svelte";
	import ModTab from "./tabs/ModTab.svelte";
	import RewardsTab from "./tabs/RewardsTab.svelte";

	function closeMenuModal() {
		st.menuModal = null;
	}

	// picking a room starts a join — close the browser so the play card's status is visible
	$effect(() => {
		if (st.changingLobby && st.menuModal === "rooms") st.menuModal = null;
	});
</script>
<RewardPopup />
<div id="mobileMessage"></div>
<div id="gameAreaWrapper">
	<div id="chatbox"><Chatbox /></div>
	<div id="actionBar"><ActionBar /></div>
	<div id="statContainer">
		<div id="health">
			<span class="title" id="healthText">HEALTH </span>
			<span class="title" id="healthValue" style:color={st.player.health <= 10 ? "#e06363" : "#fff"}>
				{st.player.health}
			</span>
		</div>
		<div id="ammo">
			<span class="title" id="ammoText">AMMO </span>
			<span class="title" id="ammoValue">
				{st.player.weapons?.length ? getCurrentWeapon(st.player).ammo.toString() : 0}
			</span>
		</div>
	</div>
	<div id="statContainer2">
		<div id="map"><canvas id="mapc"></canvas></div>
		<table id="teamProgress">
			<tbody>
				<tr>
					<td id="blueText">A</td>
					<td id="progressC">
						<div id="progressbar">
							<div id="blueProgress"></div>
						</div>
					</td>
				</tr>
				<tr id="redProgCont">
					<td id="redText">B</td>
					<td id="progressC">
						<div id="progressbar">
							<div id="redProgress"></div>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
		<div id="gameModeText"></div>
		<AccountChip inGame />
	</div>
	<div id="conStatContainer">
		<div id="pingText" class="gameDevStat">PING 0</div>
		<div id="fpsText" class="gameDevStat">FPS 60</div>
	</div>
	<div id="statContainer3">
		<div id="status"><span class="title">LEADERBOARD</span></div>
		<div id="scoreHolder">
			<div id="score">
				<span class="title" style="font-size: 18px">SCORE </span>
				<span class="title" id="scoreValue">{st.player.score}</span>
			</div>
		</div>
	</div>
	<!-- biome-ignore lint/a11y/noPositiveTabindex: removing this breaks focus? -->
	<canvas id="cvs" tabindex="1" class="noRightClick" oncontextmenu={() => false}></canvas>
</div>

<GameStatsTable />

<div id="loadingWrapper">
	<div id="loadSpinner" class="cs-loader-inner">
		<div id="loadText">PLEASE WAIT</div>
		<label>⬛</label>
		<label>⬛</label>
		<label>⬛</label>
	</div>
</div>

<div id="escMenuWrapper"></div>

<div id="startMenuWrapper">
	<AccountChip />
	<div id="menuCenter">
		<div id="mainTitleText">VERTIX ONLINE</div>
		<div id="menuCards">
			<div class="menuCard" id="rewardsCard"><RewardsTab /></div>
			<div class="menuCard" id="playCard"><StartMenu /></div>
			<div class="menuCard" id="loadoutCard"><LoadoutCard /></div>
		</div>
	</div>

	<!-- MAIN MENU MODALS: reuse the existing panels, shown on demand -->
	<Modal open={st.menuModal === "rooms"} onclose={closeMenuModal}>
		<div class="menuModalContent"><RoomList /></div>
	</Modal>
	<Modal open={st.menuModal === "settings"} title="SETTINGS" onclose={closeMenuModal}>
		<div class="menuModalContent menuModalScroll"><Settings /></div>
	</Modal>
	<Modal open={st.menuModal === "controls"} title="CONTROLS" onclose={closeMenuModal}>
		<div class="menuModalContent menuModalScroll"><Controls /></div>
	</Modal>
	<Modal open={st.menuModal === "mods"} onclose={closeMenuModal}>
		<div class="menuModalContent"><ModTab /></div>
	</Modal>
	<Modal open={st.menuModal === "account"} onclose={closeMenuModal} scrollable={false}>
		<div class="menuModalContent"><AccountWidget /></div>
	</Modal>
</div>
<div id="linkBoxRight">
	<a id="discordButton" target="_blank" href="https://discord.gg/pDwBzzd">
		<svg viewBox="0 0 127.14 96.36" width="20" height="20" fill="currentColor" aria-hidden="true">
			<path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
		</svg>
		<span>JOIN THE DISCORD</span>
	</a>
</div>
