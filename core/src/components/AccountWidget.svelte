<script lang="ts">
	import { st } from "../state.svelte.ts";
	import StatusMessage from "./common/StatusMessage.svelte";

	function openSocial(tab: "clans" | "profile") {
		st.socialTab = tab;
		if (tab === "profile") st.socialProfileUser = st.player.account?.username ?? null;
		st.menuModal = "social";
	}

	// Clan panel visibility used to be driven imperatively from app.tsx, which
	// captured these elements at module load — before this modal had ever been
	// rendered — so the lookups were null, the handler threw, and the whole
	// section stayed display:none forever. It's derived state now.
	const inClan = $derived(!!st.player.account?.clan);

	// Edit-profile fields seed from the account and stay editable afterwards. The
	// SAVE button's onclick was assigned in the same dead code path, so it never
	// did anything; dbEditUser is fully implemented server-side.
	let profileUsername = $state("");
	let profileChannel = $state("");
	let seededFor = "";
	$effect(() => {
		const account = st.player.account;
		if (account?.username && seededFor !== account.username) {
			seededFor = account.username;
			profileUsername = account.username;
			profileChannel = account.channel ?? "";
		}
	});

	function saveProfile() {
		st.socket?.emit("dbEditUser", {
			userName: profileUsername,
			userChannel: profileChannel,
		});
		st.messages.editProfile = "Please Wait...";
	}

	function discordLogin() {
		// popup keeps the game running; the callback page notifies us and closes itself
		const popup = window.open(
			"/api/auth/discord?popup=1",
			"vertix_discord",
			"width=500,height=800",
		);
		if (!popup) {
			// popup blocked — fall back to the full-page redirect flow
			window.location.href = "/api/auth/discord";
			return;
		}
		// The postMessage from the callback often can't reach us: discord.com sends
		// COOP: same-origin, which severs window.opener across the round-trip. So we
		// also poll our own session endpoint — the callback sets the session cookie
		// on this same domain regardless, so refreshLogin() will pick it up once the
		// user finishes authorizing. (The message listener in app.tsx still handles
		// the fast path when window.opener does survive.)
		st.messages.login = "Waiting for Discord...";
		let tries = 0;
		const poll = setInterval(async () => {
			tries += 1;
			let loggedIn = false;
			try {
				loggedIn = await window.refreshLogin();
			} catch {
				/* keep polling */
			}
			if (loggedIn) {
				clearInterval(poll);
				st.messages.login = "Logged in!";
				return;
			}
			let popupClosed = false;
			try {
				popupClosed = popup.closed;
			} catch {
				/* opener/popup reference may be neutered by COOP; ignore */
			}
			// stop once the popup closed or after ~5 minutes
			if (popupClosed || tries >= 150) {
				// The popup can close in the same instant the session cookie is
				// committed, so the refreshLogin() above may have raced it and missed
				// the login. Re-check once now that the popup is gone — the cookie is
				// committed before the callback's window.close() runs — so a successful
				// login shows up without forcing a full page refresh.
				if (popupClosed) {
					try {
						loggedIn = await window.refreshLogin();
					} catch {
						/* fall through */
					}
				}
				clearInterval(poll);
				if (loggedIn) {
					st.messages.login = "Logged in!";
				} else if (st.messages.login === "Waiting for Discord...") {
					st.messages.login = "";
				}
			}
		}, 2000);
	}

	function logout() {
		st.loggedIn = false;
		st.socket?.emit("dbLogout");
		window.location.href = "/api/auth/logout";
	}


</script>
<div id="accountWidget">
	<!-- NOT LOGGED IN -->
	<div style:display={st.loggedIn ? "none" : null}>
		<h3 class="menuHeaderTabbed">LOG IN</h3>
		<p class="loginBlurb">Log in with Discord to save your stats, earn quest rewards and crates, and join clans.</p>
		<button
			type="button"
			class="discordButton"
			onclick={discordLogin}
		>
			Login with Discord
		</button>
		<div id="loginMessage"><StatusMessage text={st.messages.login} /></div>
	</div>
	<!-- LOGGED IN -->
	<div style:display={st.loggedIn ? null : "none"}>
		<div id="accountStatWrapper">
			<h3 class="menuHeaderTabbed">YOUR STATS</h3>
			<div id="accountIdentity">
				{#if st.player.account?.avatar}
					<img id="accountAvatar" src={st.player.account.avatar} alt="avatar">
				{/if}
				<b>{st.player.account?.username ?? ""}</b>
			</div>
			<div id="rankProgressCont">
				<div id="rankProgress" style:width={`${st.player.account?.rankPercent ?? 0}%`}></div>
			</div>
			<div><b>Rank: </b>{st.player.account?.rank ?? "..."}</div>
			<div><b>World Rank: </b>{st.player.account?.worldRank ?? "..."}</div>
			<div><b>Likes: </b>{st.player.account?.likes ?? "..."}</div>
			<div><b>Kills: </b>{st.player.account?.kills ?? "..."}</div>
			<div><b>Deaths: </b>{st.player.account?.deaths ?? "..."}</div>
			<div><b>KD: </b>{st.player.account?.kd ?? "..."}</div>
			<!-- Clan management lives in the social hub's clans tab now; this stays a
		     summary + entry point so the account modal stays about the account. -->
			<div id="clanSummaryRow">
				<span>
					{#if inClan}
						<b>[{st.player.account.clan}]</b>
						· RNK {st.clanData.rank ?? "..."} · KDR {st.clanData.kd ?? "..."}
					{:else}
						<b>No clan</b>
					{/if}
				</span>
				<button type="button" class="smallMenuButton" onclick={() => openSocial("clans")}>
					{inClan ? "MANAGE" : "FIND"}
				</button>
			</div>
			<div id="editAccount">
				<h3 class="menuHeaderTabbed" style="margin-top:8px;">EDIT PROFILE</h3>
				<input
					bind:value={profileUsername}
					class="menuTextInput"
					placeholder="Username"
					id="newUsernameInput"
					maxlength="15"
					style="margin-bottom:10px;width:95%;"
				>
				<input
					bind:value={profileChannel}
					class="menuTextInput"
					placeholder="Youtube Channel Name/ID"
					id="youtubeChannelInput"
					style="margin-bottom:10px;width:95%;"
				>
				<button type="button" id="saveAccountData" class="smallMenuButton" onclick={saveProfile}>SAVE</button>
				<StatusMessage text={st.messages.editProfile} />
			</div>
		</div>
		<button
			type="button"
			id="logoutButton"
			onclick={logout}
			class="smallMenuButton"
			style="margin-top:10px; margin-bottom:0px;"
		>
			LOGOUT
		</button>
		<button
			type="button"
			class="smallMenuButton"
			style="margin-top:10px; margin-bottom:0px; margin-left:5px;"
			onclick={() => openSocial("profile")}
		>
			PROFILE
		</button>
	</div>
</div>

<style>
	#accountWidget {
		width: 100%;
		box-sizing: border-box;
	}

	#loginMessage {
		margin-top: 10px;
	}

	#accountStatWrapper {
		line-height: 220%;
	}

	#accountIdentity {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 5px;
	}

	#accountAvatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}

	.loginBlurb {
		font-size: 12px;
		color: rgba(0, 0, 0, 0.55);
		margin: 0 0 12px;
		line-height: 1.4;
	}

	.discordButton {
		width: 100%;
		padding: 10px;
		margin-bottom: 10px;
		background-color: #5865f2;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		font-weight: bold;
	}

	.discordButton:hover {
		background-color: #4752c4;
	}
</style>
