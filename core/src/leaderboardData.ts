import type {
	ClanProfile,
	LeaderboardData,
	LeaderboardType,
	PlayerProfile,
} from "./types.ts";

export const LB_TYPES_FRIENDLY_NAMES: Record<LeaderboardType, string> = {
	rank: "Rank",
	kdrThousand: "KDR (1000+)",
	kdrAny: "KDR (Any)",
	kills: "Kills",
	clanRank: "Clans (Rank)",
	clanKdr: "Clans (KDR)",
};

/** Which leaderboards rank clans rather than players. */
export const CLAN_LEADERBOARDS: ReadonlySet<LeaderboardType> = new Set<LeaderboardType>([
	"clanRank",
	"clanKdr",
]);

/**
 * One leaderboard row, still carrying its numbers.
 *
 * These used to be flattened into display strings here — `"${name} KDR
 * ${kdr.toFixed(2)} (${kills}/${deaths})"` — which meant the view could only
 * ever print one blob of text per row. Keeping the fields lets the social hub
 * lay them out in columns, colour the metric being ranked, and animate a rank
 * change on its own rather than redrawing the whole list.
 */
export type LeaderboardRow = {
	/** rank position, 1-based */
	position: number;
	/** player name, or clan tag for a clan board */
	name: string;
	/** clan tag for a player row; member count line for a clan row */
	subtitle: string;
	/** the number this board is sorted by, already formatted */
	metric: string;
	/** what the metric means, e.g. "KDR" */
	metricLabel: string;
	/** secondary figures, shown smaller */
	detail: string;
	/** stable identity across refreshes, so a row can be tracked as it moves */
	key: string;
	/** true for clan rows, which open a clan rather than a profile */
	isClan: boolean;
};

export type LeaderboardUIData = Record<LeaderboardType, LeaderboardRow[]>;

function playerRow(
	player: PlayerProfile,
	index: number,
	metric: string,
	metricLabel: string,
	detail: string,
): LeaderboardRow {
	return {
		position: index + 1,
		name: player.name,
		subtitle: player.clan ? `[${player.clan.toUpperCase()}]` : "",
		metric,
		metricLabel,
		detail,
		key: `p:${player.name}`,
		isClan: false,
	};
}

function clanRow(clan: ClanProfile, index: number, metric: string, metricLabel: string): LeaderboardRow {
	return {
		position: index + 1,
		name: `[${clan.name}]`,
		subtitle: `${clan.numMembers} member${clan.numMembers === 1 ? "" : "s"}`,
		metric,
		metricLabel,
		detail: `RNK ${clan.rank}`,
		key: `c:${clan.name}`,
		isClan: true,
	};
}

export function emptyLeaderboardUIData(): LeaderboardUIData {
	return {
		rank: [],
		kdrThousand: [],
		kdrAny: [],
		kills: [],
		clanRank: [],
		clanKdr: [],
	};
}

export async function fetchLeaderboards(): Promise<LeaderboardUIData> {
	const res = await fetch("/api/getLbs");
	if (!res.ok) throw new Error(`leaderboards unavailable (${res.status})`);
	const data: LeaderboardData = await res.json();

	const kdrRows = (players: PlayerProfile[]) =>
		players.map((player, i) =>
			playerRow(
				player,
				i,
				player.kdr.toFixed(2),
				"KDR",
				`${player.numKills} / ${player.numDeaths}`,
			),
		);

	return {
		rank: data.rank.map((player, i) =>
			playerRow(player, i, String(player.rank), "RANK", `${player.score.toLocaleString()} score`),
		),
		kdrThousand: kdrRows(data.kdrThousand),
		kdrAny: kdrRows(data.kdrAny),
		kills: data.kills.map((player, i) =>
			playerRow(player, i, player.numKills.toLocaleString(), "KILLS", `RNK ${player.rank}`),
		),
		clanRank: data.clanRank.map((clan, i) => clanRow(clan, i, String(clan.rank), "RANK")),
		clanKdr: data.clanKdr.map((clan, i) => clanRow(clan, i, clan.kdr.toFixed(2), "KDR")),
	};
}
