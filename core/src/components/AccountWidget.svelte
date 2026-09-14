<script lang="ts">
	import { st } from "../state.svelte.ts";
	import StatusMessage from "./common/StatusMessage.svelte";

	let clanCreateName = $state("");
	let clanJoinName = $state("");
	let clanInviteUsername = $state("");
	let clanChatUrl = $state("");

	// Clan panel visibility used to be driven imperatively from app.tsx, which
	// captured these elements at module load — before this modal had ever been
	// rendered — so the lookups were null, the handler threw, and the whole
	// section stayed display:none forever. It's derived state now.
	const inClan = $derived(!!st.player.account?.clan);
	const isClanOwner = $derived(!!st.player.account?.isClanOwner);

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

	function startCreateClan() {
		if (!clanCreateName) return;
		st.socket?.emit("dbClanCreate", {
			clanName: clanCreateName,
		});
		st.messages.clanDB = "Please Wait...";
	}
	function startJoinClan() {
		if (!clanJoinName) return;
		st.socket?.emit("dbClanJoin", {
			clanKey: clanJoinName,
		});
		st.messages.clanDB = "Please Wait...";
	}
	function startInviteClan() {
		if (!clanInviteUsername) return;
		st.socket?.emit("dbClanInvite", {
			userName: clanInviteUsername,
		});
		st.messages.clanInv = "Please Wait...";
	}
	function startKickFromClan() {
		if (!clanInviteUsername) return;
		st.socket?.emit("dbClanKick", {
			userName: clanInviteUsername,
		});
		st.messages.clanInv = "Please Wait...";
	}
	function startSetClanChat() {
		st.socket?.emit("dbClanChatURL", {
			chUrl: clanChatUrl,
		});
		st.messages.clanCht = "Please Wait...";
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
			<h3 id="clanHeader">{inClan ? `[${st.player.account.clan}] CLAN:` : "CLANS"}</h3>
			<div id="clanSignUp" style:display={inClan ? "none" : "block"}>
				<input
					bind:value={clanCreateName}
					class="menuTextInput"
					placeholder="Clan Name"
					id="clanNameInput"
					maxlength="4"
					style="width:70%;"
				>
				<button
					type="button"
					id="createClanButton"
					class="smallMenuButton"
					style="margin-left:5px;"
					onclick={startCreateClan}
				>
					CREATE
				</button>
				<input
					bind:value={clanJoinName}
					class="menuTextInput"
					placeholder="Clan Name"
					id="clanKeyInput"
					maxlength="4"
					style="width:78%;"
				>
				<button
					type="button"
					id="joinClanButton"
					class="smallMenuButton"
					style="margin-left:5px;"
					onclick={startJoinClan}
				>
					JOIN
				</button>
				<StatusMessage text={st.messages.clanDB} />
			</div>
			<div id="clanStats" style:display={inClan ? "block" : "none"}>
				<div id="clanStatFounder"><b>Founder: </b>{st.clanData.founder ?? "..."}</div>
				<div id="clanStatRank"><b>Rank: </b>{st.clanData.rank ?? "..."}</div>
				<div id="clanStatKD"><b>Avg KD: </b>{st.clanData.kd ?? "..."}</div>
				<div id="clanStatMembers">
					<b>Roster: </b>
					<br>
					{st.clanData.members ?? "..."}
				</div>
				<div id="clanChatLink" style="margin-top:5px;">
					{#if st.clanData.chatURL && typeof st.clanData.chatURL === "string"}
						{@const chatURL = st.clanData.chatURL.startsWith("http") ? st.clanData.chatURL : `https://${st.clanData.chatURL}`}
						<a target="_blank" href={chatURL} rel="noopener"> Clan Chat </a>
					{/if}
				</div>
				<div id="clanAdminPanel" style:display={isClanOwner ? "block" : "none"} style:margin-top="10px">
					<input
						bind:value={clanChatUrl}
						class="menuTextInput"
						placeholder="Clan Chat URL"
						id="clanChatInput"
						maxlength="50"
						style="width:95%;"
					>
					<button
						type="button"
						id="setChatClanButton"
						class="smallMenuButton"
						style="margin-top:10px;"
						onclick={startSetClanChat}
					>
						UPDATE
					</button>
					<StatusMessage text={st.messages.clanCht} inline />
					<input
						bind:value={clanInviteUsername}
						class="menuTextInput"
						placeholder="Username"
						id="clanInviteInput"
						maxlength="15"
						style="width:95%;"
					>
					<button
						type="button"
						id="inviteClanButton"
						class="smallMenuButton"
						style="margin-top:10px;"
						onclick={startInviteClan}
					>
						INVITE
					</button>
					<button
						type="button"
						id="kickClanButton"
						class="smallMenuButton"
						style="margin-left:5px;margin-top:10px;"
						onclick={startKickFromClan}
					>
						KICK
					</button>
					<StatusMessage text={st.messages.clanInv} />
				</div>
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
			id="leaveClanButton"
			onclick={() => st.socket?.emit("dbClanLeave")}
			class="smallMenuButton"
			style="margin-top:10px; margin-left:5px; margin-bottom:0px;"
			style:display={inClan ? "inline-block" : "none"}
		>
			{isClanOwner ? "DELETE CLAN" : "LEAVE CLAN"}
		</button>
		<button
			type="button"
			class="smallMenuButton"
			style="margin-top:10px; margin-bottom:0px; margin-left:5px;"
			onclick={() => window.open(`/profile.html?${st.player.account.username}`, "_blank")}
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
