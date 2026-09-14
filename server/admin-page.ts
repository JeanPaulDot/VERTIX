// Self-contained admin dashboard. Served at /admin by index.ts; the page loads
// its JS from /admin.js (a separate file, NOT inline) because the server's CSP
// is `script-src 'self'`, which blocks inline <script> tags.
//
// The page talks to /api/admin/* using a token the operator pastes in (kept in
// localStorage, sent as an Authorization: Bearer header).

export const ADMIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vertix — Admin</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #0d1117; color: #e6edf3; padding: 24px; }
h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: #8b949e; margin-bottom: 20px; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.card h2 { margin: 0 0 12px; font-size: 15px; color: #58a6ff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #21262d; vertical-align: top; }
th { color: #8b949e; font-weight: 600; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; }
.boss { background: #db4fcd22; color: #db4fcd; }
.human { background: #23863622; color: #3fb950; }
.bot { background: #30363d; color: #8b949e; }
.lobby { background: #1f6feb22; color: #58a6ff; }
input[type=password], input[type=text] { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; padding: 8px 10px; border-radius: 6px; width: 320px; max-width: 100%; }
button { background: #238636; border: 0; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; }
button:hover { background: #2ea043; }
button.secondary { background: #30363d; }
button.secondary:hover { background: #484f58; }
button.danger { background: #da3633; padding: 3px 8px; font-size: 12px; }
#error { color: #f85149; margin-top: 8px; }
.meta { color: #8b949e; font-size: 12px; margin-bottom: 8px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs button { background: #21262d; border-radius: 6px 6px 0 0; }
.tabs button.active { background: #238636; }
.link { color: #58a6ff; cursor: pointer; }
.pager { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
</style>
</head>
<body>
<h1>Vertix — Admin Dashboard</h1>
<div class="sub">Rooms, players, users, sessions and bug reports.</div>

<div id="auth" class="card">
  <h2>Unlock</h2>
  <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off" />
  <button id="unlock">Unlock</button>
  <div id="error"></div>
</div>

<div id="dashboard" style="display:none">
  <div class="topbar">
    <div class="meta" id="lastUpdated"></div>
    <button id="lock" class="secondary">Lock</button>
  </div>

  <div class="tabs">
    <button data-tab="overview">Overview</button>
    <button data-tab="users">Users</button>
    <button data-tab="sessions">Sessions</button>
    <button data-tab="bugs">Bug Reports</button>
  </div>

  <div id="tab-overview" class="tab">
    <div class="card"><h2>Server</h2><div id="serverStats" class="meta"></div></div>
    <div class="card"><h2>Rooms</h2><div id="rooms"></div></div>
    <div class="card"><h2>Lobby</h2><div id="lobby"></div></div>
  </div>

  <div id="tab-users" class="tab" style="display:none">
    <div class="card">
      <h2>Users</h2>
      <div style="margin-bottom:8px">
        <input type="text" id="userSearch" placeholder="Search username..." />
        <button id="userSearchBtn" class="secondary">Search</button>
      </div>
      <div id="usersTable"></div>
      <div class="pager">
        <button id="userPrev" class="secondary">Prev</button>
        <span class="meta" id="userPageInfo"></span>
        <button id="userNext" class="secondary">Next</button>
      </div>
    </div>
    <div class="card" id="userProfileCard" style="display:none">
      <h2 id="userProfileTitle">Profile</h2>
      <div id="userProfile"></div>
    </div>
  </div>

  <div id="tab-sessions" class="tab" style="display:none">
    <div class="card">
      <h2>IP Lookup</h2>
      <div style="margin-bottom:8px">
        <input type="text" id="ipInput" placeholder="IP address (e.g. 1.2.3.4)" />
        <button id="ipLookupBtn" class="secondary">Lookup</button>
      </div>
      <div id="ipResult"></div>
    </div>
    <div class="card">
      <h2>Recent Sessions</h2>
      <div id="sessionsTable"></div>
    </div>
  </div>

  <div id="tab-bugs" class="tab" style="display:none">
    <div class="card"><h2>Bug Reports</h2><div id="bugs"></div></div>
  </div>
</div>

<script src="/admin.js"></script>
</body>
</html>`;

export const ADMIN_PAGE_JS = `(function () {
"use strict";
var TOKEN_KEY = "vertix_admin_token";
var tokenInput = document.getElementById("token");
var unlockBtn = document.getElementById("unlock");
var lockBtn = document.getElementById("lock");
var errorEl = document.getElementById("error");
var authEl = document.getElementById("auth");
var dashboardEl = document.getElementById("dashboard");
var lastUpdatedEl = document.getElementById("lastUpdated");

var userPage = 1;
var userQuery = "";

function token() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}
function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

function showDashboard(show) {
  authEl.style.display = show ? "none" : "block";
  dashboardEl.style.display = show ? "block" : "none";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function authHeaders() { return { Authorization: "Bearer " + token() }; }

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}
function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return "—";
  sec = Math.max(0, Math.floor(sec));
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + s + "s";
  return s + "s";
}
function kd(k, d) {
  if (!d) return k > 0 ? "∞" : "—";
  return (k / d).toFixed(2);
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(function (el) { el.style.display = "none"; });
  document.getElementById("tab-" + tab).style.display = "block";
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-tab") === tab);
  });
  if (tab === "users") loadUsers();
  if (tab === "sessions") loadSessions();
}

async function refresh() {
  var t = token();
  if (!t) { showDashboard(false); return; }
  try {
    var headers = authHeaders();
    var resp = await Promise.all([
      fetch("/api/admin/overview", { headers: headers }),
      fetch("/api/admin/bugReports", { headers: headers }),
    ]);
    if (resp[0].status === 401 || resp[1].status === 401) {
      showDashboard(false); errorEl.textContent = "Invalid token."; return;
    }
    if (!resp[0].ok) throw new Error("overview HTTP " + resp[0].status);
    if (!resp[1].ok) throw new Error("bugReports HTTP " + resp[1].status);
    renderOverview(await resp[0].json());
    renderBugReports(await resp[1].json());
    lastUpdatedEl.textContent = "Updated " + new Date().toLocaleTimeString();
    showDashboard(true);
  } catch (e) {
    errorEl.textContent = "Failed to load: " + e.message;
  }
}

function renderOverview(data) {
  var s = data.server;
  document.getElementById("serverStats").textContent =
    s.rooms + " rooms · " + s.humans + " humans · " + s.bots + " bots · " + s.lobby + " in lobby · " + s.generatedAt;

  document.getElementById("rooms").innerHTML = data.rooms.length === 0
    ? "<div class='meta'>No rooms.</div>"
    : "<table><tr><th>Room</th><th>Mode</th><th>Players</th><th>Score</th></tr>" +
      data.rooms.map(function (r) {
        var players = r.players.map(function (p) {
          var tag = p.isBoss ? "<span class='badge boss'>BOSS</span> "
            : (p.human ? "<span class='badge human'>human</span> " : "<span class='badge bot'>bot</span> ");
          return tag + esc(p.name) + " (" + esc(p.team) + ", " + p.score + "pts" + (p.connected ? "" : ", left") + ")";
        }).join("<br>");
        return "<tr><td>" + esc(r.name) + (r.permanent ? "" : " <span class='badge lobby'>private</span>") +
          "</td><td>" + esc(r.modeName) + "</td><td>" + esc(r.occupancy) + "/" + r.maxPlayers + "<br>" + players +
          "</td><td>" + r.leaderboardScore + "%</td></tr>";
      }).join("") + "</table>";

  document.getElementById("lobby").innerHTML = data.lobby.length === 0
    ? "<div class='meta'>No one in the lobby.</div>"
    : "<table><tr><th>User</th><th>IP</th><th>For</th></tr>" +
      data.lobby.map(function (l) {
        return "<tr><td>" + esc(l.username) + "</td><td>" + esc(l.ip) + "</td><td>" + esc(l.connectedFor) + "</td></tr>";
      }).join("") + "</table>";
}

async function loadUsers() {
  try {
    var q = "q=" + encodeURIComponent(userQuery) + "&page=" + userPage + "&limit=50";
    var resp = await fetch("/api/admin/users?" + q, { headers: authHeaders() });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var data = await resp.json();
    renderUsers(data);
  } catch (e) {
    errorEl.textContent = "Failed to load users: " + e.message;
  }
}

function renderUsers(data) {
  var totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  document.getElementById("userPageInfo").textContent =
    "Page " + data.page + " / " + totalPages + " · " + data.total + " users";

  var html = "<table><tr><th>User</th><th>Discord</th><th>K/D</th><th>Sessions</th><th>Play time</th><th>Last seen</th><th>Last IP</th></tr>";
  data.users.forEach(function (u) {
    html += "<tr>" +
      "<td><span class='link' data-user='" + u.id + "'>" + esc(u.username) + "</span><div class='meta'>rank " + Math.floor(u.score / 1000) + "</div></td>" +
      "<td>" + esc(u.discord_username || "—") + "</td>" +
      "<td>" + kd(u.kills, u.deaths) + " <span class='meta'>(" + u.kills + "/" + u.deaths + ")</span></td>" +
      "<td>" + u.session_count + "</td>" +
      "<td>" + fmtDuration(u.play_time_seconds) + "</td>" +
      "<td>" + fmtDate(u.last_seen) + "</td>" +
      "<td>" + esc(u.last_ip || "—") + "</td>" +
      "</tr>";
  });
  html += "</table>";
  document.getElementById("usersTable").innerHTML = html;

  document.querySelectorAll("#usersTable [data-user]").forEach(function (el) {
    el.addEventListener("click", function () { loadUserProfile(el.getAttribute("data-user")); });
  });
}

async function loadUserProfile(id) {
  try {
    var resp = await fetch("/api/admin/users/" + id, { headers: authHeaders() });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var data = await resp.json();
    renderUserProfile(data);
  } catch (e) {
    errorEl.textContent = "Failed to load profile: " + e.message;
  }
}

function renderUserProfile(data) {
  var u = data.user;
  document.getElementById("userProfileTitle").textContent = "Profile — " + u.username;
  var html = "<div class='meta'>" +
    "Discord: " + esc(u.discord_username || "—") + " · " +
    "Created: " + esc(u.created_at) + " · " +
    "First seen: " + fmtDate(u.first_seen) + " · " +
    "Last seen: " + fmtDate(u.last_seen) + "</div>" +
    "<div class='meta'>Score: " + u.score + " · Kills: " + u.kills + " · Deaths: " + u.deaths +
    " · Damage: " + u.total_damage + " · K/D: " + kd(u.kills, u.deaths) + "</div>";

  html += "<h2>IPs</h2>";
  html += data.ips.length === 0 ? "<div class='meta'>No IPs recorded.</div>"
    : "<table><tr><th>IP</th><th>First seen</th><th>Last seen</th><th>Count</th></tr>" +
      data.ips.map(function (i) {
        return "<tr><td><span class='link' data-ip='" + esc(i.ip) + "'>" + esc(i.ip) + "</span></td>" +
          "<td>" + fmtDate(i.first_seen) + "</td><td>" + fmtDate(i.last_seen) + "</td><td>" + i.count + "</td></tr>";
      }).join("") + "</table>";

  html += "<h2>Sessions</h2>";
  html += data.sessions.length === 0 ? "<div class='meta'>No sessions.</div>"
    : "<table><tr><th>Started</th><th>Room</th><th>Duration</th><th>IP</th></tr>" +
      data.sessions.map(function (s) {
        return "<tr><td>" + fmtDate(s.started_at) + "</td><td>" + esc(s.room) + "</td>" +
          "<td>" + fmtDuration(s.duration_seconds) + "</td><td>" + esc(s.ip) + "</td></tr>";
      }).join("") + "</table>";

  document.getElementById("userProfile").innerHTML = html;
  document.getElementById("userProfileCard").style.display = "block";

  document.querySelectorAll("#userProfile [data-ip]").forEach(function (el) {
    el.addEventListener("click", function () { lookupIp(el.getAttribute("data-ip")); });
  });
}

async function loadSessions() {
  try {
    var resp = await fetch("/api/admin/sessions?limit=200", { headers: authHeaders() });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var sessions = await resp.json();
    document.getElementById("sessionsTable").innerHTML = sessions.length === 0
      ? "<div class='meta'>No sessions.</div>"
      : "<table><tr><th>User</th><th>IP</th><th>Room</th><th>Started</th><th>Duration</th></tr>" +
        sessions.map(function (s) {
          return "<tr><td>" + esc(s.username) + "</td>" +
            "<td><span class='link' data-ip='" + esc(s.ip) + "'>" + esc(s.ip) + "</span></td>" +
            "<td>" + esc(s.room) + "</td><td>" + fmtDate(s.started_at) + "</td>" +
            "<td>" + fmtDuration(s.duration_seconds) + "</td></tr>";
        }).join("") + "</table>";
    document.querySelectorAll("#sessionsTable [data-ip]").forEach(function (el) {
      el.addEventListener("click", function () { lookupIp(el.getAttribute("data-ip")); });
    });
  } catch (e) {
    errorEl.textContent = "Failed to load sessions: " + e.message;
  }
}

async function lookupIp(ip) {
  if (!ip) {
    ip = document.getElementById("ipInput").value.trim();
  }
  if (!ip) return;
  try {
    var resp = await fetch("/api/admin/ips/" + encodeURIComponent(ip), { headers: authHeaders() });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var users = await resp.json();
    document.getElementById("ipResult").innerHTML = "<div class='meta'>IP " + esc(ip) + "</div>" +
      (users.length === 0 ? "<div class='meta'>No users seen from this IP.</div>"
        : "<table><tr><th>Username</th><th>First seen</th><th>Last seen</th><th>Count</th></tr>" +
          users.map(function (u) {
            return "<tr><td>" + esc(u.username) + "</td><td>" + fmtDate(u.first_seen) +
              "</td><td>" + fmtDate(u.last_seen) + "</td><td>" + u.count + "</td></tr>";
          }).join("") + "</table>");
  } catch (e) {
    errorEl.textContent = "Failed to lookup IP: " + e.message;
  }
}

function renderBugReports(bugs) {
  var container = document.getElementById("bugs");
  if (!Array.isArray(bugs) || bugs.length === 0) {
    container.innerHTML = "<div class='meta'>No bug reports.</div>";
    return;
  }
  container.innerHTML = "<table><tr><th>When</th><th>User</th><th>Room</th><th>Report</th><th></th></tr>" +
    bugs.map(function (b) {
      return "<tr>" +
        "<td>" + esc(b.created_at) + "</td>" +
        "<td>" + esc(b.username || "(guest)") + "</td>" +
        "<td>" + esc(b.room || "—") + " (" + esc(b.mode || "—") + ")</td>" +
        "<td>" + esc(b.message) + "<div class='meta'>" + esc(b.ip) + " · " + esc(b.user_agent) + "</div></td>" +
        "<td><button class='danger' data-id='" + b.id + "'>Resolve</button></td>" +
        "</tr>";
    }).join("") + "</table>";

  container.querySelectorAll("button[data-id]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      deleteBugReport(btn.getAttribute("data-id"));
    });
  });
}

async function deleteBugReport(id) {
  try {
    var resp = await fetch("/api/admin/bugReports/" + id, { method: "DELETE", headers: authHeaders() });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    refresh();
  } catch (e) {
    errorEl.textContent = "Failed to delete: " + e.message;
  }
}

// --- wiring ---
unlockBtn.addEventListener("click", function () {
  setToken(tokenInput.value.trim());
  errorEl.textContent = "";
  refresh();
});
lockBtn.addEventListener("click", function () {
  clearToken();
  tokenInput.value = "";
  showDashboard(false);
});

document.querySelectorAll(".tabs button").forEach(function (btn) {
  btn.addEventListener("click", function () { switchTab(btn.getAttribute("data-tab")); });
});
document.getElementById("userSearchBtn").addEventListener("click", function () {
  userQuery = document.getElementById("userSearch").value.trim();
  userPage = 1;
  loadUsers();
});
document.getElementById("userSearch").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    userQuery = e.target.value.trim();
    userPage = 1;
    loadUsers();
  }
});
document.getElementById("userPrev").addEventListener("click", function () {
  if (userPage > 1) { userPage--; loadUsers(); }
});
document.getElementById("userNext").addEventListener("click", function () {
  userPage++; loadUsers();
});
document.getElementById("ipLookupBtn").addEventListener("click", function () { lookupIp(); });

tokenInput.value = token();
if (token()) { refresh(); }
setInterval(refresh, 5000);
})();`;
