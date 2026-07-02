<script lang="ts">
	import { st } from "../state.svelte.ts";
	import { getCurrentWeapon } from "../utils.ts";
	import ActionBar from "./ActionBar.svelte";
	import Chatbox from "./Chatbox.svelte";
	import DropUpLink from "./DropUpLink.svelte";
	import GameStatsTable from "./GameStatsTable.svelte";
	import RightMenu from "./RightMenu.svelte";
	import RoomList from "./RoomList.svelte";
	import StartMenu from "./StartMenu.svelte";
</script>
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
	<div id="mainTitleText">VERTIX ONLINE</div>
	<div id="roomWrapper"><RoomList /></div>
	<div id="startMenu"><StartMenu /></div>

	<!-- RIGHT MENU -->
	<div id="rightMenu"><RightMenu /></div>
</div>
<div id="linkBoxRight">
	<DropUpLink title="MODS">
		<li>
			<a
				target="_blank"
				href="https://www.reddit.com/r/VertixOnline/comments/43ol5a/texture_mods_please_post_all_texture_mods_here/"
			>
				FIND A MOD
			</a>
		</li>
		<li>
			<a target="_blank" href="https://www.reddit.com/r/VertixOnline/comments/444pzc/guide_how_to_make_a_mod/">
				MAKE A MOD
			</a>
		</li>
	</DropUpLink>
	|
	<DropUpLink title="COMMUNITY">
		<li><a target="_blank" href="">FORUM</a></li>
		<li><a target="_blank" href="">FACEBOOK</a></li>
		<li><a target="_blank" href="">DISCORD</a></li>
		<li><a target="_blank" href="">YOUTUBE</a></li>
	</DropUpLink>
	|
	<DropUpLink title="OTHER">
		<li>
			<a target="_blank" href="https://www.reddit.com/r/VertixOnline/wiki/index"> WIKI </a>
		</li>
		<li><a target="_blank" href="./terms.txt">TERMS OF USE</a></li>
		<li><a target="_blank" href="./privacy.txt">PRIVACY POLICY</a></li>
		<li><a target="_blank" href="./versions.txt">VERSION HISTORY</a></li>
	</DropUpLink>
	| <a target="_blank" href="./versions.txt">V3.8 (CHANGELOG)</a>
</div>
<div id="linkBoxLeft">
	THANKS FOR PLAYING! |
	<DropUpLink title="DONATE">
		<div style="width: 200px; color: rgba(0, 0, 0, 0.6);">
			PLEASE CONSIDER DONATING TO ONE OF
			<a target="_blank" href="./donate.html">THESE</a>
			CHARITIES.
		</div>
	</DropUpLink>
	|
	<DropUpLink title="SHARE">
		<li><a target="_blank" href="https://www.facebook.com/sharer.php?u=https://vertix.io"> FACEBOOK </a></li>
		<li>
			<a
				target="_blank"
				href="https://twitter.com/share?url=https://vertix.io&amp;text=Check out&amp;hashtags=vertix.io"
			>
				TWITTER
			</a>
		</li>
	</DropUpLink>
</div>
