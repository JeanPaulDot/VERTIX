import type {
	ClanProfile,
	LeaderboardData,
	LeaderboardEntry,
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

function getBasePlayerLeaderboardEntry(player: PlayerProfile) {
	return {
		clanText: player.clan ? `[${player.clan.toUpperCase()}]` : "",
		link: `/profile.html?${player.name}`,
	};
}

function getPlayerKdrLeaderboardEntry(player: PlayerProfile): LeaderboardEntry {
	return {
		...getBasePlayerLeaderboardEntry(player),
		text: `${player.name} KDR ${player.kdr.toFixed(2)} (${player.numKills}/${player.numDeaths})`,
	};
}

function getClanLeaderboardEntry(clan: ClanProfile): LeaderboardEntry {
	return {
		clanText: `[${clan.name}] (${clan.numMembers} members)`,
		text: `RNK ${clan.rank} KDR ${clan.kdr.toFixed(2)}`,
		link: `/clans.html?${clan.name}`,
	};
}

export type LeaderboardUIData = Record<LeaderboardType, LeaderboardEntry[]>;

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
	const leaderboardData: LeaderboardData = await res.json();

	return {
		rank: leaderboardData.rank.map((player) => ({
			...getBasePlayerLeaderboardEntry(player),
			text: `${player.name} RNK ${player.rank}`,
		})),
		kdrThousand: leaderboardData.kdrThousand.map(getPlayerKdrLeaderboardEntry),
		kdrAny: leaderboardData.kdrAny.map(getPlayerKdrLeaderboardEntry),
		kills: leaderboardData.kills.map((player) => ({
			...getBasePlayerLeaderboardEntry(player),
			text: `${player.name} ${player.numKills} KILLS`,
		})),
		clanRank: leaderboardData.clanRank.map(getClanLeaderboardEntry),
		clanKdr: leaderboardData.clanKdr.map(getClanLeaderboardEntry),
	};
}

export function openLeaderboardEntry(leaderboardEntry: LeaderboardEntry) {
	if (leaderboardEntry.link) {
		window.open(leaderboardEntry.link, "_blank");
	}
}
