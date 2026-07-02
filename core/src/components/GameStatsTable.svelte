<script lang="ts">
	import { st } from "../state.svelte";
	import type { Player, StatTableCell, StatTableRow } from "../types";
	import { getItemRarityColor, TeamColors } from "../utils";

	const isZoneWar = $derived(st.gameMap?.gameMode.code === "zmtch");

	const tableRows = $derived.by(() => {
		const rows: StatTableRow[] = [];

		const sortedPlayers = st.players.toSorted(sortPlayersByScore);
		for (const player of sortedPlayers) {
			if (!player.team) continue;

			let playerColor = "#fff";
			if (player.index !== st.player.index) {
				playerColor = player.team !== st.player.team ? TeamColors.Red : TeamColors.Blue;
			}

			rows.push({
				player,
				cells: [
					{
						text: player.name,
						className: "contL",
						canClick: player.loggedIn,
						color: playerColor,
					},
					{
						text: player.score || 0,
						className: "contC",
						color: "#fff",
					},
					{
						text: player.kills || 0,
						className: "contC",
						color: "#fff",
					},
					{
						text: player.deaths || 0,
						className: "contC",
						color: "#fff",
					},
					{
						text: player.totalDamage || 0,
						className: "contC",
						color: "#fff",
					},
					{
						text: (isZoneWar ? player.totalGoals : player.totalHealing) || 0,
						className: "contC",
						color: "#fff",
					},
					{
						text: player.lastItem?.name ?? "No Reward",
						className: "rewardText",
						color: player.lastItem ? getItemRarityColor(player.lastItem.chance) : "#fff",
						hoverInfo: player.lastItem,
					},
				],
			});
		}

		return rows;
	});

	function sortPlayersByScore(a: Player, b: Player) {
		if (a.score !== b.score) {
			return b.score - a.score;
		}
		return b.id - a.id;
	}

	function onClickCell(cell: StatTableCell) {
		if (cell.className === "contL" && cell.canClick) {
			window.open(`/profile.html?${cell.text}`, "_blank");
		}
	}

	function onClickNice(destIndex: number) {
		document.getElementById("cvs")!.focus();
		st.socket?.emit("like", st.player.index, destIndex);
		if (st.currentLiked === destIndex) {
			st.currentLiked = null;
		} else {
			if (st.currentLiked !== null) {
				st.socket?.emit("like", st.player.index, st.currentLiked);
			}
			st.currentLiked = destIndex;
		}
	}
</script>

<div id="gameStatWrapper">
	<p id="nextGameTimer"></p>
	<div id="gameStatsContainer">
		<p id="winningTeamText"></p>
		<table id="gameStatBoard">
			<thead>
				<tr>
					<th class="headerL">NAME</th>
					<th class="headerC">SCORE</th>
					<th class="headerC">KILLS</th>
					<th class="headerC">DEATHS</th>
					<th class="headerC">DAMAGE</th>
					<th class="headerC">{isZoneWar ? "GOALS" : "HEALING"}</th>
					<th class="headerC">REWARD</th>
				</tr>
			</thead>
			<tbody>
				{#each tableRows as row}
					<tr>
						{#each row.cells as cell}
							<td class={cell.className} style:color={cell.color} onclick={() => onClickCell(cell)}>
								<span>{cell.text}</span>
								{#if cell.hoverInfo}
									<div class="hoverTooltip">
										{#if cell.hoverInfo.type === "hat"}
											<img class="hatDisplayImage" src={`/images/hats/${cell.hoverInfo.id}/d.png`}>
											<div class="rewardName" style:color={cell.color}>
												{cell.hoverInfo.name}
											</div>
											<div class="rewardDropRate">droprate {cell.hoverInfo.chance}%</div>
											<div class="rewardSubText" style:color={cell.hoverInfo.isDuplicate ? "#e04141" : "#d8d8d8"}>
												<i>{cell.hoverInfo.isDuplicate ? "Duplicate" : "Wearable"}</i>
											</div>
											<div class="rewardDescription">{cell.hoverInfo.desc}</div>
											{#if cell.hoverInfo.creator !== "EatMyApples"}
												<div class="rewardCreator">
													<i>Artist: {cell.hoverInfo.creator}</i>
												</div>
											{/if}
										{:else if cell.hoverInfo.type === "shirt"}
											<img class="shirtDisplayImage" src={`/images/shirts/${cell.hoverInfo.id}/d.png`}>
											<div class="rewardName" style:color={cell.color}>
												{cell.hoverInfo.name}
											</div>
											<div class="rewardDropRate">droprate {cell.hoverInfo.chance}%</div>
											<div class="rewardSubText" style:color={cell.hoverInfo.isDuplicate ? "#e04141" : "#d8d8d8"}>
												<i>{cell.hoverInfo.isDuplicate ? "Duplicate" : "Wearable"}</i>
											</div>
											<div class="rewardDescription">{cell.hoverInfo.desc}</div>
										{:else}
											<img class="camoDisplayImage" src={`/images/camos/${cell.hoverInfo.id + 1}.png`}>
											<div class="rewardName" style:color={cell.color}>
												{cell.hoverInfo.name}
											</div>
											<div class="rewardDropRate">droprate {cell.hoverInfo.chance}%</div>
											<div class="rewardSubText" style:color={cell.hoverInfo.isDuplicate ? "#e04141" : "#d8d8d8"}>
												<i>{cell.hoverInfo.isDuplicate ? "Duplicate" : "weapon camo"}</i>
											</div>
											<div class="rewardDescription">{cell.hoverInfo.weaponName}</div>
										{/if}
									</div>
								{/if}
							</td>
						{/each}
						{#if row.player.index !== st.player.index}
							<td>
								<button
									type="button"
									class={row.player.index === st.currentLiked ? "gameStatLikeButtonA" : "gameStatLikeButton"}
									onclick={() => onClickNice(row.player.index)}
								>
									NICE
								</button>
							</td>
						{/if}
						<td>
							<span class="likeStat">{row.player.likedBy.length}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div id="voteModeContainer"></div>
</div>

<style>
	#gameStatWrapper {
		text-align: center;
		display: none;
		pointer-events: none;
		z-index: 2;
		position: absolute;
		top: 45%;
		left: 50%;
		margin-right: -50%;
		transform: translate(-50%, -50%) scale(1);
	}

	#voteModeContainer {
		pointer-events: none;
		width: 100%;
		margin-bottom: 8px;
	}

	#winningTeamText {
		margin-top: 2px;
		margin-bottom: 2px;
		font-size: 20px;
	}

	#nextGameTimer {
		color: var(--white);
		font-size: 18px;
	}

	#gameStatsContainer {
		display: inline-block;
		padding: 20px;
		background-color: rgba(0, 0, 0, 0.2);
		margin-bottom: 10px;
		vertical-align: top;
		color: var(--white);
		text-align: center;
		font-size: 19px;
	}

	#gameStatBoard {
		text-align: center;
		border-collapse: separate;
		border-spacing: 22px 5px;
		width: 100%;
	}

	#gameStatBoard .headerL {
		text-align: left;
		font-size: 17px;
		color: var(--white);
	}

	#gameStatBoard .headerC {
		font-size: 17px;
		color: var(--white);
	}

	#gameStatBoard .contL {
		pointer-events: all;
		cursor: pointer;
		text-align: left;
		max-width: 250px;
		overflow: hidden;
		font-size: 13px;
		text-overflow: ellipsis;
		position: relative;
	}

	#gameStatBoard .contC {
		font-size: 13px;
	}

	.gameStatLikeButton {
		font-size: 15px;
		color: #232323;
		background-color: #eaeaea;
		pointer-events: auto;
	}

	.gameStatLikeButton:active {
		background-color: #a2a2a2;
	}

	.gameStatLikeButton:hover {
		background-color: #cecece;
	}

	.likeStat {
		font-size: 13px;
	}

	.gameStatLikeButtonA {
		font-size: 15px;
		color: #232323;
		background-color: #a2a2a2;
		pointer-events: auto;
	}

	.rewardText {
		cursor:
			url("./cursor_aim.png") 17 17,
			default;
		pointer-events: all;
		position: relative;
		font-size: 15px;
	}

	.rewardName {
		font-size: 16px;
		margin-top: 5px;
	}

	.rewardDropRate {
		color: "#ffd100";
		font-size: 12px;
		margin-top: 0px;
	}

	.rewardSubText {
		color: "#e04141";
		font-size: 8px;
		margin-top: 1px;
	}

	.rewardDescription {
		font-size: 12px;
		margin-top: 5px;
	}

	.rewardCreator {
		color: "#d8d8d8";
		font-size: 8px;
		margin-top: 5px;
	}
</style>
