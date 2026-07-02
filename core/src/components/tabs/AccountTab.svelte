<script lang="ts">
	import { st } from "../../state.svelte.ts";

	let username = $state("");
	let email = $state("");
	let password = $state("");

	let clanCreateName = $state("");
	let clanJoinName = $state("");
	let clanInviteUsername = $state("");
	let clanChatUrl = $state("");

	let loginMessage: HTMLElement;
	let clanDBMessage: HTMLElement;
	let clanInvMessage: HTMLElement;
	let clanChtMessage: HTMLElement;

	function startLogin() {
		loginMessage.style.display = "block";
		loginMessage.textContent = "Please Wait...";
		fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userName: username, userPass: password }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.error) {
					loginMessage.textContent = data.error;
				} else {
					loginMessage.textContent = "Logged in! Reconnecting...";
					st.loggedIn = true;
					st.playerName = data.username;
					// Reload to pick up the session cookie
					window.location.reload();
				}
			})
			.catch(() => {
				loginMessage.textContent = "Connection failed";
			});
	}
	function startRegister() {
		loginMessage.style.display = "block";
		loginMessage.textContent = "Registering...";
		fetch("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userName: username, userEmail: email, userPass: password }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.error) {
					loginMessage.textContent = data.error;
				} else {
					loginMessage.textContent = "Registered! Reconnecting...";
					st.loggedIn = true;
					st.playerName = data.username;
					window.location.reload();
				}
			})
			.catch(() => {
				loginMessage.textContent = "Connection failed";
			});
	}
	function startRecover() {
		if (!st.socket) return;
		st.socket.emit("dbRecov", {
			userMail: email,
		});
		loginMessage.style.display = "block";
		loginMessage.textContent = "Please Wait...";
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
		clanDBMessage.style.display = "block";
		clanDBMessage.textContent = "Please Wait...";
	}
	function startJoinClan() {
		if (!clanJoinName) return;
		st.socket?.emit("dbClanJoin", {
			clanKey: clanJoinName,
		});
		clanDBMessage.style.display = "block";
		clanDBMessage.textContent = "Please Wait...";
	}
	function startInviteClan() {
		if (!clanInviteUsername) return;
		st.socket?.emit("dbClanInvite", {
			userName: clanInviteUsername,
		});
		clanInvMessage.style.display = "block";
		clanInvMessage.textContent = "Please Wait...";
	}
	function startKickFromClan() {
		if (!clanInviteUsername) return;
		st.socket?.emit("dbClanKick", {
			userName: clanInviteUsername,
		});
		clanInvMessage.style.display = "block";
		clanInvMessage.textContent = "Please Wait...";
	}
	function startSetClanChat() {
		st.socket?.emit("dbClanChatURL", {
			chUrl: clanChatUrl,
		});
		clanChtMessage.style.display = "inline-block";
		clanChtMessage.textContent = "Please Wait...";
	}
</script>
<!-- NOT LOGGED IN -->
<div style:width="300px" style:display={st.loggedIn ? "none" : null}>
	<h3 class="menuHeaderTabbed">LOGIN &amp; REGISTER</h3>
	<button
		type="button"
		class="discordButton"
		onclick={() => (window.location.href = "/api/auth/discord")}
	>
		Login with Discord
	</button>
	<div class="divider"><span>or</span></div>
	<input
		type="text"
		class="menuTextInput"
		style="margin-bottom:10px;"
		placeholder="Username"
		id="usernameInput"
		maxlength="15"
		bind:value={username}
	>
	<input
		type="text"
		class="menuTextInput"
		style="margin-bottom:10px;"
		placeholder="Email (Registration Only)"
		id="emailInput"
		maxlength="40"
		bind:value={email}
	>
	<input
		type="password"
		class="menuTextInput"
		placeholder="Password"
		id="passwordInput"
		maxlength="15"
		bind:value={password}
	>
	<div id="loginMessage" bind:this={loginMessage} style="display:none;"></div>
	<button type="button" id="registerButton" onclick={startRegister} class="smallMenuButton">REGISTER</button>
	<button type="button" id="loginButton" onclick={startLogin} class="smallMenuButton">LOGIN</button>
	<button type="button" id="recoverButton" onclick={startRecover} class="smallMenuButton">RECOVER</button>
	<div id="recoverForm" style="display:none;">
		<input class="menuTextInput" placeholder="Enter Key" id="chngPassKey" maxlength="4" style="width:100%;">
		<input
			class="menuTextInput"
			type="password"
			placeholder="Enter new Password"
			id="chngPassPass"
			maxlength="15"
			style="width:72%;margin-top:10px;"
		>
		<button type="button" id="chngPassButton" class="smallMenuButton" style="margin-left:5px;margin-top:10px;">
			Change
		</button>
	</div>
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
		<h3 id="clanHeader">CLANS</h3>
		<div id="clanSignUp" style:display="none">
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
			<div id="clanDBMessage" bind:this={clanDBMessage} class="serverRespMsg">Join or Create a Clan.</div>
		</div>
		<div id="clanStats" style:display="none">
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
			<div id="clanAdminPanel" style="display:none;margin-top:10px;">
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
				<div
					id="clanChtMessage"
					bind:this={clanChtMessage}
					class="serverRespMsg"
					style="display:inline-block;margin-left:5px;"
				>
					(eg. Discord URL)
				</div>
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
				<div id="clanInvMessage" bind:this={clanInvMessage} class="serverRespMsg">Invite or Kick Members.</div>
			</div>
		</div>
		<div id="editAccount">
			<h3 class="menuHeaderTabbed" style="margin-top:8px;">EDIT PROFILE</h3>
			<input
				class="menuTextInput"
				placeholder="Username"
				id="newUsernameInput"
				maxlength="15"
				style="margin-bottom:10px;width:95%;"
			>
			<input
				class="menuTextInput"
				placeholder="Youtube Channel Name/ID"
				id="youtubeChannelInput"
				style="margin-bottom:10px;width:95%;"
			>
			<button type="button" id="saveAccountData" class="smallMenuButton">SAVE</button>
			<div id="editProfileMessage" class="serverRespMsg">Edit Profile Info.</div>
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
		style="margin-top:10px; margin-left:5px; margin-bottom:0px; display:none;"
	>
		LEAVE CLAN
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

<style>
	#loginMessage {
		margin-top: 10px;
	}

	#accountStatWrapper {
		max-height: 190px;
		overflow-y: scroll;
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

	.serverRespMsg {
		margin-top: 0px;
	}

	#registerButton {
		margin-top: 10px;
	}

	#loginButton {
		margin-top: 10px;
		margin-left: 5px;
	}

	#recoverButton {
		margin-top: 10px;
		margin-left: 5px;
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

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		margin-bottom: 10px;
		color: #888;
		font-size: 12px;
	}

	.divider::before,
	.divider::after {
		content: "";
		flex: 1;
		border-bottom: 1px solid #555;
	}

	.divider span {
		padding: 0 10px;
	}
</style>
