// Self-contained admin dashboard page. Served at /admin by index.ts; it talks
// to /api/admin/* using a token the operator pastes in (kept in localStorage,
// sent as an Authorization: Bearer header). No build step — plain HTML/JS.

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
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #21262d; }
th { color: #8b949e; font-weight: 600; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; }
.boss { background: #db4fcd22; color: #db4fcd; }
.human { background: #23863622; color: #3fb950; }
.bot { background: #30363d; color: #8b949e; }
.lobby { background: #1f6feb22; color: #58a6ff; }
input[type=password] { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; padding: 8px 10px; border-radius: 6px; width: 320px; max-width: 100%; }
button { background: #238636; border: 0; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; }
button:hover { background: #2ea043; }
#error { color: #f85149; margin-top: 8px; }
.meta { color: #8b949e; font-size: 12px; margin-bottom: 8px; }
</style>
</head>
<body>
<h1>Vertix — Admin Dashboard</h1>
<div class="sub">Rooms, players and lobby presence.</div>

<div id="auth" class="card">
  <h2>Unlock</h2>
  <input type="password" id="token" placeholder="ADMIN_TOKEN" autocomplete="off" />
  <button id="unlock">Unlock</button>
  <div id="error"></div>
</div>

<div id="dashboard" style="display:none">
  <div class="card">
    <h2>Server</h2>
    <div id="serverStats" class="meta"></div>
  </div>
  <div class="card">
    <h2>Rooms</h2>
    <div id="rooms"></div>
  </div>
  <div class="card">
    <h2>Lobby (menu, not in a room)</h2>
    <div id="lobby"></div>
  </div>
  <div class="card">
    <h2>Bug Reports</h2>
    <div id="bugs"></div>
  </div>
</div>

<script>
const TOKEN_KEY = "vertix_admin_token";
const tokenInput = document.getElementById("token");
const unlockBtn = document.getElementById("unlock");
const errorEl = document.getElementById("error");
const authEl = document.getElementById("auth");
const dashboardEl = document.getElementById("dashboard");

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function showDashboard(show) {
  authEl.style.display = show ? "none" : "block";
  dashboardEl.style.display = show ? "block" : "none";
}

async function refresh() {
  const t = token();
  if (!t) { showDashboard(false); return; }
  try {
    const headers = { Authorization: "Bearer " + t };
    const [overviewRes, bugsRes] = await Promise.all([
      fetch("/api/admin/overview", { headers }),
      fetch("/api/admin/bugReports", { headers }),
    ]);
    if (overviewRes.status === 401 || bugsRes.status === 401) {
      showDashboard(false); errorEl.textContent = "Invalid token."; return;
    }
    if (!overviewRes.ok) throw new Error("overview HTTP " + overviewRes.status);
    if (!bugsRes.ok) throw new Error("bugReports HTTP " + bugsRes.status);
    const overview = await overviewRes.json();
    const bugs = await bugsRes.json();
    render(overview);
    renderBugReports(bugs);
    showDashboard(true);
  } catch (e) {
    errorEl.textContent = "Failed to load: " + e.message;
  }
}

function render(data) {
  const s = data.server;
  document.getElementById("serverStats").textContent =
    s.rooms + " rooms · " + s.humans + " humans · " + s.bots + " bots · " + s.lobby + " in lobby · " + s.generatedAt;

  document.getElementById("rooms").innerHTML = data.rooms.length === 0
    ? "<div class='meta'>No rooms.</div>"
    : "<table><tr><th>Room</th><th>Mode</th><th>Players</th><th>Score</th></tr>" +
      data.rooms.map(r => {
        const players = r.players.map(p => {
          const tag = p.isBoss ? "<span class='badge boss'>BOSS</span> "
            : (p.human ? "<span class='badge human'>human</span> " : "<span class='badge bot'>bot</span> ");
          return tag + esc(p.name) + " (" + esc(p.team) + ", " + p.score + "pts" + (p.connected ? "" : ", left") + ")";
        }).join("<br>");
        return "<tr><td>" + esc(r.name) + (r.permanent ? "" : " <span class='badge lobby'>private</span>") +
          "</td><td>" + esc(r.modeName) + "</td><td>" + r.occupancy + "/" + r.maxPlayers + "<br>" + players +
          "</td><td>" + r.leaderboardScore + "%</td></tr>";
      }).join("") + "</table>";

  document.getElementById("lobby").innerHTML = data.lobby.length === 0
    ? "<div class='meta'>No one in the lobby.</div>"
    : "<table><tr><th>User</th><th>IP</th><th>For</th></tr>" +
      data.lobby.map(l => "<tr><td>" + esc(l.username) + "</td><td>" + esc(l.ip) + "</td><td>" + esc(l.connectedFor) + "</td></tr>").join("") +
      "</table>";
}

function renderBugReports(bugs) {
  document.getElementById("bugs").innerHTML = bugs.length === 0
    ? "<div class='meta'>No bug reports.</div>"
    : "<table><tr><th>When</th><th>User</th><th>Room</th><th>Report</th></tr>" +
      bugs.map(b =>
        "<tr><td>" + esc(b.created_at) + "</td>" +
        "<td>" + esc(b.username || "(guest)") + "</td>" +
        "<td>" + esc(b.room || "—") + " (" + esc(b.mode || "—") + ")</td>" +
        "<td>" + esc(b.message) + "<div class='meta'>" + esc(b.ip) + " · " + esc(b.user_agent) + "</div></td></tr>"
      ).join("") + "</table>";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

unlockBtn.addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, tokenInput.value.trim());
  errorEl.textContent = "";
  refresh();
});

tokenInput.value = token();
if (token()) refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
