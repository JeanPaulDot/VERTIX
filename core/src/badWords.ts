// Basic profanity/slur filter for player names. Substring-matched (case-
// insensitive) so compound forms are caught too. Deliberately avoids short
// ambiguous words ("ass", "hell", "damn", "rape") that would false-positive on
// common words like "class", "hello", "grape".

const BAD_WORDS = [
	"fuck",
	"shit",
	"bitch",
	"cunt",
	"dick",
	"cock",
	"pussy",
	"whore",
	"slut",
	"nigger",
	"nigga",
	"faggot",
	"fag",
	"retard",
	"retarded",
	"asshole",
	"dumbass",
	"jackass",
	"bastard",
	"motherfucker",
	"prick",
	"twat",
	"wanker",
	"kike",
	"spic",
	"chink",
	"wetback",
	"pedo",
	"pedophile",
	"rapist",
	"porn",
	"kys",
	"suicide",
];

export function containsBadWord(name: string): boolean {
	const lower = name.toLowerCase();
	return BAD_WORDS.some((word) => lower.includes(word));
}