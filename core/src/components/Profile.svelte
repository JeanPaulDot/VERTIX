<script lang="ts">
	import { io, type Socket } from "socket.io-client";
	import NavigationBar from "./NavigationBar.svelte";

	// WAIT FOR WINDOW TO LOAD:
	let socket: Socket;
	let serverMessage = $state("");
	const userNameVar = window.location.search.substring(1);
	const userName = document.getElementById("userName")!;
	const userClanName = document.getElementById("userClanName")!;
	const userRank = document.getElementById("userRank")!;
	const userHats = document.getElementById("userHats")!;
	const userWorldRank = document.getElementById("userWorldRank")!;
	const userKDR = document.getElementById("userKDR")!;
	const userLikes = document.getElementById("userLikes")!;
	const userScore = document.getElementById("userScore")!;
	const userKills = document.getElementById("userKills")!;
	const userDeaths = document.getElementById("userDeaths")!;

	window.onload = async () => {
		if (!userNameVar) {
			serverMessage = "No profile Found.";
			throw new Error("No profile Found.");
		}

		if (socket) return;

		// connect through the vite /socket.io proxy so this also works for remote players
		socket = io({
			autoConnect: false, // temporary
			reconnection: false,
			forceNew: true,
			query: {
				statUser: userNameVar,
			},
		});

		socket.on("getStats", (stats, worked) => {
			if (worked) {
				let tmpClan: string;
				if (!stats.clan) {
					tmpClan = "NO CLAN";
				} else {
					tmpClan = `[${stats.clan.toUpperCase()}]`;
				}
				userName.textContent = String(stats.name);
				userClanName.textContent = tmpClan;
				userRank.textContent = String(stats.rank);
				userWorldRank.textContent = `#${stats.world}`;
				userKDR.textContent = (Math.max(1, stats.kills) / Math.max(1, stats.deaths)).toFixed(2);
				userScore.textContent = abbreviateNumber(stats.score);
				userLikes.textContent = abbreviateNumber(stats.likes);
				userKills.textContent = abbreviateNumber(stats.kills);
				userHats.textContent = String(stats.hatsTotal);
				userDeaths.textContent = abbreviateNumber(stats.deaths);
				// loadSocialButtons(stats);
			} else {
				serverMessage = stats;
			}
			socket.disconnect();
		});

		socket.on("connect_failed", () => {
			serverMessage = "Connection Failed. Try again later.";
		});
	};

	// function loadSocialButtons(user) {
	// 	twttr.widgets.createShareButton(
	// 		encodeURI("http://vertix.io/profile.html?" + user.name),
	// 		document.getElementById("twitterContainer"),
	// 		{
	// 			text: "Check out my stats on Vertix Online:",
	// 			hashtags: "vertix.io",
	// 			size: "large",
	// 		},
	// 	);
	// 	if (user.channel != "") {
	// 		gapi.ytsubscribe.render(document.getElementById("youtuberReplace"), {
	// 			channel: user.channel,
	// 			layout: "default",
	// 		});
	// 	}
	// }

	function abbreviateNumber(value: number) {
		if (value < 1000) return value.toString();

		const suffixes = ["", "k", "m", "b", "t"];
		const suffixIndex = Math.floor(Math.log10(value) / 3);
		const shortValue = value / 1000 ** suffixIndex;

		const formatted = parseFloat(shortValue.toPrecision(2)).toString();

		return `${formatted}${suffixes[suffixIndex]}`;
	}
</script>

<NavigationBar currentPage="profile" />
<div id="content" class="clearfix">
	<section id="left">
		<div id="userStats" class="clearfix">
			<div class="pic">
				<a href="#"><img id="userProfileImg" src="./assets/favicon.png" width="102px" height="102px"></a>
			</div>
			<div class="data">
				<h1 id="userName">Loading...</h1>
				<h3 id="userClanName"></h3>
				<ul class="numbers clearfix">
					<li>World<strong id="userWorldRank">...</strong></li>
					<li>Rank<strong id="userRank">...</strong></li>
					<li>KDR<strong id="userKDR">...</strong></li>
					<li>Kills<strong id="userKills">...</strong></li>
					<li>Deaths<strong id="userDeaths">...</strong></li>
					<li>Score<strong id="userScore">...</strong></li>
					<li>Hats<strong id="userHats">...</strong></li>
					<li>Likes<strong id="userLikes">...</strong></li>
				</ul>
			</div>
			<div id="twitterContainer"></div>
			<div id="youtubeContainer"><div id="youtuberReplace"></div></div>
		</div>
		<h1 id="serverMessage">{serverMessage}</h1>
	</section>
	<section id="right">
		<div class="gcontent">
			<div class="head"><h1>Achievements (0)</h1></div>
			<div class="boxy">
				<p>Coming Soon...</p>
			</div>
		</div>
		<div class="gcontent">
			<div class="head"><h1>Friends (0)</h1></div>
			<div class="boxy">
				<p>Coming Soon...</p>
			</div>
		</div>
	</section>
</div>

<!-- <script>
    window.twttr = (function (d, s, id) {
        var js,
            fjs = d.getElementsByTagName(s)[0],
            t = window.twttr || {};
        if (d.getElementById(id)) return t;
        js = d.createElement(s);
        js.id = id;
        js.src = "https://platform.twitter.com/widgets.js";
        fjs.parentNode.insertBefore(js, fjs);

        t._e = [];
        t.ready = function (f) {
            t._e.push(f);
        };

        return t;
    })(document, "script", "twitter-wjs");
</script> -->

<style>
	a {
		color: #3c86b7;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	ul {
		line-height: 120%;
	}

	p {
		font-size: 1.2em;
		line-height: 1.4em;
		font-family: Arial, sans-serif;
		color: #333;
		margin-bottom: 15px;
	}

	h1 {
		font-family: Helvetica, Arial, Verdana, sans-serif;
		color: #444;
		font-weight: bold;
		font-size: 1.7em;
		line-height: 2em;
	}

	h3 {
		color: #698216;
		font-weight: normal;
		font-size: 1.3em;
		line-height: 1.6em;
	}

	#content {
		display: block;
		width: 820px;
		margin: 0 auto;
	}

	#left {
		display: block;
		width: 560px;
		float: left;
		margin-right: 20px;
	}

	#right {
		display: block;
		width: 240px;
		float: left;
		overflow: hidden;
	}

	#userStats {
		display: block;
		width: auto;
		background-color: #fff;
		padding: 12px;
		box-shadow: inset 0 -5px #e0e0e0;
	}

	#userStats .pic {
		float: left;
		display: block;
		margin-right: 10px;
		image-rendering: pixelated;
	}

	#userStats .data {
		float: left;
		display: block;
		position: relative;
		width: 79%;
		padding: 4px;
		padding-left: 15px;
		background: #e6e6e6;
		overflow: hidden;
		box-sizing: border-box;
	}

	#serverMessage {
		font-size: 25px;
		color: #fff;
	}

	#twitterContainer {
		margin-top: 10px;
		margin-bottom: 4px;
		float: right;
	}

	#youtubeContainer {
		margin-right: 10px;
		margin-top: 10px;
		margin-bottom: 4px;
		float: right;
	}

	#userStats .data h1 {
		color: #474747;
		display: inline-block;
		line-height: 1.6em;
		font-size: 28px;
		text-shadow: 0px 1px 1px #fff;
	}

	#userStats .data h3 {
		display: inline-block;
		color: #666;
		line-height: 1.6em;
		margin-bottom: 5px;
		font-size: 18px;
		padding: 10px;
	}

	#userStats .data ul.numbers {
		list-style: none;
		padding-top: 7px;
		margin-bottom: 10px;
		color: #676767;
		margin-left: 0px;
		display: block;
	}

	#userStats .data ul.numbers li {
		float: left;
		text-align: left;
		display: block;
		margin-top: 5px;
		padding-left: 0px;
		margin-bottom: 0px;
		padding-right: 10px;
		margin-right: 10px;
		border-right: 1px dotted #bbb;
		text-transform: uppercase;
	}

	#userStats .data ul.numbers li:last-of-type {
		border-right: 0px;
	}

	#userStats .data ul.numbers li strong {
		color: #434343;
		display: block;
		font-size: 26px;
		line-height: 1.1em;
		font-weight: bold;
	}

	#right .gcontent {
		display: block;
		margin-bottom: 20px;
	}

	#right .gcontent .head {
		background: #76b3e3;
		padding-left: 8px;
	}

	#right .gcontent .head h1 {
		color: #fff;
		font-weight: bold;
		font-size: 1.4em;
	}

	#right .gcontent .boxy {
		padding: 10px 8px;
		background: #fff;
		box-shadow: inset 0 -5px #e0e0e0;
	}

	.clearfix:after {
		content: ".";
		display: block;
		clear: both;
		visibility: hidden;
		line-height: 0;
		height: 0;
	}

	.clearfix {
		display: inline-block;
	}
</style>
