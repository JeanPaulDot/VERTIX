// Redirect stub for the retired standalone social pages. Each of profile.html,
// leaderboards.html, clans.html and friends.html loads this script with a
// data-social-tab attribute; it forwards the visitor into the SPA's social hub
// at the right tab, preserving the old query-string formats:
//
//   /profile.html?SomeUser      -> /?social=profile&user=SomeUser
//   /clans.html?ABCD            -> /?social=clans&clan=ABCD
//   /leaderboards.html          -> /?social=leaderboards
//   /friends.html               -> /?social=friends
//
// It is an external file (not inline) because the production CSP is
// script-src 'self', which blocks inline <script> in served pages.
(function () {
	"use strict";
	var script = document.currentScript;
	if (!script) return;
	var tab = script.getAttribute("data-social-tab") || "friends";
	var params = new URLSearchParams(location.search);
	var target = "/?social=" + encodeURIComponent(tab);

	function bareValue() {
		// the old links passed the payload bare (?SomeUser, ?ABCD) with no key.
		// a "=" anywhere means it is a key=value pair, and usernames and clan
		// tags are [A-Za-z0-9_-] so "=" can never appear in the legacy form.
		var bare = location.search.substring(1);
		return bare && !bare.includes("=") ? bare : null;
	}

	var user = params.get("user") || (tab === "profile" ? bareValue() : null);
	if (user) target += "&user=" + encodeURIComponent(user);
	var clan = params.get("clan") || (tab === "clans" ? bareValue() : null);
	if (clan) target += "&clan=" + encodeURIComponent(clan);

	location.replace(target);
})();
