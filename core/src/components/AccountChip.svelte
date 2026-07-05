<script lang="ts">
	import { st } from "../state.svelte.ts";

	interface Props {
		// compact dark variant rendered inside the game HUD (no absolute pinning,
		// no profile/login actions — just live identity + rank + score)
		inGame?: boolean;
	}
	const { inGame = false }: Props = $props();

	const username = $derived(st.player.account?.username ?? "");
	const avatarLetter = $derived(username ? username.charAt(0).toUpperCase() : "?");
	const score = $derived(st.player.account?.score);
</script>

{#if !inGame || st.loggedIn}
	<div id="accountChip" class:inGame>
		{#if st.loggedIn}
			{#if st.player.account?.avatar}
				<img class="chipAvatar" src={st.player.account.avatar} alt="avatar">
			{:else}
				<div class="chipAvatar chipAvatarLetter">{avatarLetter}</div>
			{/if}
			<div class="chipBody">
				<div class="chipTopRow">
					<b class="chipName">{username}</b>
					<span class="chipRank">RANK {st.player.account?.rank ?? "..."}</span>
				</div>
				<div class="chipRankBar">
					<div class="chipRankFill" style:width={`${st.player.account?.rankPercent ?? 0}%`}></div>
				</div>
				<div class="chipScoreRow">
					<span class="chipScore">{score != null ? `${score.toLocaleString()} SCORE` : ""}</span>
					<span class="chipScore">{st.player.account?.rankPercent != null ? `${Math.round(1000 - ((st.player.account.rankPercent ?? 0) * 10))} TO NEXT RANK` : ""}</span>
				</div>
			</div>
			{#if !inGame}
				<div class="chipLink" onclick={() => st.menuModal = "account"}>PROFILE</div>
			{/if}
		{:else}
			<div class="chipAvatar chipAvatarLetter">?</div>
			<div class="chipGuest">Playing as guest</div>
			<button type="button" class="smallMenuButton" onclick={() => st.menuModal = "account"}>LOGIN</button>
		{/if}
	</div>
{/if}

<style>
	#accountChip {
		position: absolute;
		top: 20px;
		right: 20px;
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--white);
		border-radius: 1px;
		box-shadow: inset 0 -3px #e0e0e0;
		padding: 10px 14px;
		min-width: 240px;
		max-width: calc(100vw - 40px);
		box-sizing: border-box;
		z-index: 5;
		pointer-events: auto;
	}
	.chipAvatar {
		width: 34px;
		height: 34px;
		border-radius: 1px;
		flex: none;
	}
	.chipAvatarLetter {
		background: #76b3e3;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 16px;
	}
	.chipBody {
		flex: 1;
		min-width: 0;
	}
	.chipTopRow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
	}
	.chipName {
		color: rgba(0, 0, 0, 0.7);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chipRank {
		color: rgba(0, 0, 0, 0.45);
		font-size: 11px;
		white-space: nowrap;
	}
	.chipRankBar {
		background: rgba(0, 0, 0, 0.1);
		height: 8px;
		margin-top: 5px;
	}
	.chipRankFill {
		background: #76b3e3;
		height: 8px;
		transition: width 0.4s;
	}
	.chipScoreRow {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin-top: 4px;
	}
	.chipScore {
		color: rgba(0, 0, 0, 0.45);
		font-size: 10px;
		white-space: nowrap;
	}
	.chipLink {
		cursor: pointer;
		color: var(--blue);
		font-size: 11px;
		flex: none;
	}
	.chipLink:hover {
		text-decoration: underline;
	}
	.chipGuest {
		flex: 1;
		color: rgba(0, 0, 0, 0.5);
		font-size: 12px;
	}

	/* in-game HUD variant: flows inside the HUD container, dark translucent */
	#accountChip.inGame {
		position: static;
		min-width: 0;
		width: 220px;
		margin-top: 10px;
		background: rgba(0, 0, 0, 0.25);
		box-shadow: none;
		padding: 8px 10px;
	}
	#accountChip.inGame .chipName {
		color: #fff;
	}
	#accountChip.inGame .chipRank,
	#accountChip.inGame .chipScore {
		color: rgba(255, 255, 255, 0.75);
	}
	#accountChip.inGame .chipRankBar {
		background: rgba(255, 255, 255, 0.2);
	}

	/* on narrow screens the pinned chip would overlap the title — let it flow above the menu instead */
	@media (max-width: 900px) {
		#accountChip:not(.inGame) {
			position: static;
			margin: 0 auto 4px;
			width: 100%;
			max-width: 400px;
		}
	}
</style>
