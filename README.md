# VERTIX ONLINE

A web-based multiplayer arena shooter — a modern revival of Vertix Online. Built with Svelte 5, Hono, Socket.IO, and SQLite.

## Features

### Gameplay
- **9 Game Modes**: Free For All, Team Deathmatch, Hardpoint, Lootcrate, Sniper War, Boss Hunt, Zone War, Rocket War, Pyro War
- **10 Selectable Classes**: Triggerman, Detective, Hunter, Run N Gun, Vince, Rocketeer and more — each with unique primary/secondary weapons (plus mode-assigned boss classes the player cannot pick)
- **24 Handcrafted Maps** with mode-specific rotations
- **Real-time multiplayer** via Socket.IO with room browser, private rooms, and room codes
- **Bot AI** for filling empty slots
- **Custom Mods** — load community texture packs via URL or local files

### Account & Progression
- **Account System** — Discord OAuth (the only login method); guests can play without an account
- **Ranked Progression** — earn score to rank up (every 1,000 score), cosmetic unlocks at score milestones
- **Crate Reward System** — earn crates on rank up, open them for random cosmetics weighted by rarity
- **127 Hats, 133+ Camos, 70+ Shirts** — each with rarity tiers (Common → Legendary)

### Quest System
- **Daily Quests** — 3 random quests per day (UTC midnight rotation), earn score or crate rewards
- **Weekly Challenge** — 1 harder quest per week (Monday UTC rotation), earn crates
- **Login Streak** — consecutive daily logins build a 7-day streak; day 7 grants +1 crate and the track rolls back to day 1
- **Quest Tracking** — progress tracked from kills, damage, wins, goals, healing per round
- **Claim Rewards** — click CLAIM on completed quests to receive score bonuses or crates

### Social
- **Clans** — create or join 4-letter clans, clan leaderboards, owner add/kick (there is no invite/accept flow — an "invite" adds the named player directly)
- **Friends** — see who's online, Discord-linked friend directory
- **Leaderboards** — rank, KDR, kills, clan rank, clan KDR
- **Profile Pages** — public profile at `/profile.html?username`

### UI
- **Main Menu** — three-card layout (Quests, Play, Loadout) with account widget
- **Room Browser** — filter by mode, search by code, create private rooms
- **Settings** — graphics toggles, keybind customization, chat options
- **Reward Popups** — animated crate opening, unlock reveals, rank-up notifications

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Svelte 5 (runes), Vite 8 (MPA) |
| Backend | Hono (HTTP), Socket.IO (real-time) |
| Database | SQLite via better-sqlite3 |
| Auth | Discord OAuth2, JWT sessions (jose) |
| Build | pnpm monorepo |
| Deploy | Docker + Docker Compose |

## Project Structure

```
vertix/
├── core/                    # Frontend (Svelte 5 + Vite)
│   ├── src/
│   │   ├── app.tsx          # Main entry, game loop, socket handlers
│   │   ├── state.svelte.ts  # Global reactive state (Svelte 5 runes)
│   │   ├── components/      # Svelte UI components
│   │   │   ├── App.svelte           # Root layout (menu + game)
│   │   │   ├── StartMenu.svelte     # Play card
│   │   │   ├── LoadoutCard.svelte   # Loadout + rewards card
│   │   │   ├── AccountChip.svelte   # Top-right account widget
│   │   │   ├── AccountWidget.svelte # Login/register modal
│   │   │   ├── RoomList.svelte      # Room browser
│   │   │   ├── Settings.svelte      # Settings panel
│   │   │   ├── Controls.svelte      # Keybind editor
│   │   │   ├── RewardPopup.svelte   # Crate/unlock popups
│   │   │   ├── tabs/
│   │   │   │   ├── RewardsTab.svelte  # Quests + streak UI
│   │   │   │   ├── LoadoutTab.svelte  # Loadout editor
│   │   │   │   └── ModTab.svelte      # Mod loader
│   │   │   └── common/
│   │   │       └── Modal.svelte       # Reusable modal wrapper
│   │   ├── loadouts.ts     # Class definitions + weapons
│   │   ├── skins.ts        # Cosmetic catalogs (hats/shirts/camos)
│   │   ├── gamemodes.ts    # Game mode configs
│   │   └── utils.ts        # Shared utilities
│   └── assets/             # CSS, fonts, images
├── server/                  # Backend (Hono + Socket.IO)
│   ├── index.ts            # Server entry, HTTP routes, socket setup
│   ├── db.ts               # SQLite schema + queries
│   ├── auth.ts             # Auth handlers (login, register, clans)
│   ├── quests.ts           # Quest generation, progress, streak
│   ├── unlocks.ts          # Cosmetic unlock + crate logic
│   ├── room.ts             # Room management + game events
│   ├── game.ts             # Game state (players, map, bullets)
│   ├── maps.ts             # Map tile data
│   ├── bots.ts             # Bot AI
│   ├── oauth.ts            # Discord OAuth + HTTP auth routes
│   ├── session.ts          # JWT session management
│   └── security.ts         # Rate limiting, input validation
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── pnpm-workspace.yaml
```

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Account credentials, Discord link, cosmetics |
| `player_stats` | Lifetime score, kills, deaths, damage, healing, goals, likes |
| `clans` | Clan name, owner, chat URL |
| `clan_members` | Clan membership (user ↔ clan, role) |
| `user_unlocks` | Owned cosmetics (hat/shirt/camo × item_id) |
| `user_crates` | Unopened/opened crates with source tracking |
| `user_quests` | Daily/weekly quest progress per user per period |
| `user_login_streak` | Login streak day (1-7) and last login date |

## How to Run Locally

### Prerequisites
- [Node.js v25](https://nodejs.org/en/download) (not LTS)
- [pnpm](https://pnpm.io/installation)
- [Git](https://git-scm.com/)

### Windows

```powershell
git clone https://github.com/KrunkerRevivalProject/vertix.git
cd vertix
pnpm install
pnpm dev
```

Open http://localhost:5173

### Linux

```bash
git clone https://github.com/KrunkerRevivalProject/vertix.git
cd vertix
pnpm install
pnpm dev
```

Open http://localhost:5173

## Docker Deployment

1. Copy `.env.example` to `.env` and fill in values:
   ```
   NODE_ENV=production
   SESSION_SECRET=<random-64-char-string>
   CORS_ORIGINS=https://vertix.vestiges.tech
   TRUST_PROXY=1
   ```

   `TRUST_PROXY` is the number of reverse proxies in front of the server (nginx or
   Nginx Proxy Manager = 1). It is **required** behind a proxy: without it every
   player shares one rate-limit key, because the proxy address is the only one the
   server sees — which caps the whole server at the per-IP connection limit.

2. (Optional) Set up Discord OAuth:
   ```
   DISCORD_CLIENT_ID=your-app-id
   DISCORD_CLIENT_SECRET=your-secret
   DISCORD_REDIRECT_URI=https://vertix.vestiges.tech/api/auth/discord/callback
   ```
   The redirect URI must be the same origin players open the game on and must be
   registered in the [Discord developer portal](https://discord.com/developers/applications).

3. Create the external network and start:
   ```bash
   docker network create vertix-net
   docker compose up -d
   ```

4. The server runs on port `1118` in production (page + `/api` + Socket.IO). Port
   `1119` is dev-only, where Vite proxies the socket separately.

### Reverse proxy

In production the Node server serves the built frontend, `/api` **and** Socket.IO
all on port `1118`, so one proxy rule covers everything — the websocket upgrade
included. `nginx.conf` in the repo root is a ready-to-use vhost for a plain nginx +
certbot host; if you run Nginx Proxy Manager instead, forward
`https://vertix.vestiges.tech` → `http://server:1118` with websockets enabled.

Either way the proxy must send `X-Forwarded-For` and the server must have
`TRUST_PROXY=1`, or per-IP rate limiting collapses onto a single key.

### Logs & health

`docker compose logs -f server` shows a boot sequence (maps, database, CORS, Discord
config, rooms, listen port), then real gameplay events — players joining and leaving
with their session length and score, chat, rounds ending, rooms opening and closing —
plus a `[status]` heartbeat every minute with uptime and which rooms have players.

Bot-vs-bot kills and bot spawns are logged at `debug`, not `info`: with 9 permanent
rooms of bots fighting continuously they drown out everything else. Set
`LOG_LEVEL=debug` in `.env` when you actually want them, or `STATUS_INTERVAL_MS=0`
to silence the heartbeat.

`GET /api/health` answers with uptime, room count and the human/bot player split —
useful for a proxy health check or a quick `curl` from the host:

```bash
docker compose exec server wget -qO- http://localhost:1118/api/health
```

### Typechecking and tests

`pnpm typecheck` runs `svelte-check` over the client and `tsc --noEmit` over the
server; both are expected to be clean. `pnpm test` runs the unit tests. The Docker
build runs both of the client-side halves, so a type error or a failing test fails
the image instead of shipping.

`pnpm audit --prod` should report no vulnerabilities.

## Quest System Details

### Daily Quests (3 per day)
| Quest | Reward |
|-------|--------|
| Get 10 kills | +150 SCORE |
| Get 15 kills | +200 SCORE |
| Get 20 kills | +250 SCORE |
| Deal 500 damage | +200 SCORE |
| Deal 1,000 damage | +300 SCORE |
| Deal 1,500 damage | +400 SCORE |
| Win 1 round | +1 CRATE |
| Win 2 rounds | +2 CRATES |
| Win 3 rounds | +3 CRATES |
| Score 2 goals | +1 CRATE |
| Heal 300 HP | +200 SCORE |

### Weekly Challenge (1 per week)
| Quest | Reward |
|-------|--------|
| Score 10,000 points | +2 CRATES |
| Get 100 kills | +3 CRATES |
| Win 20 rounds | +2 CRATES |
| Deal 15,000 damage | +3 CRATES |

### Login Streak
| Day | Reward |
|-----|--------|
| 1-6 | +50 SCORE each |
| 7 | +1 CRATE, then the track restarts at day 1 |

Quest score rewards are **bonus score** — they do not affect ranking.

---

<details>
<summary>TODO / Roadmap</summary>

### High Priority
- [ ] Quest variety — mode-specific quests (e.g. "Win 3 rounds of Hardpoint")
- [ ] Quest rarity tiers — daily/epic/legendary quest pools
- [ ] Seasonal events — limited-time quest chains with exclusive rewards
- [ ] Input validation overhaul — standard-schema integration for socket events
      (the highest-risk fields are clamped in `security.ts`, but validation is
      still ad hoc per handler)
- [ ] Session revocation — logout only clears the cookie, so a leaked JWT stays
      valid for its full 7 days
- [ ] `/api/friends` returns the whole Discord-linked directory; paginate it
- [ ] Game over menu — finish moving from JSX to Svelte

### Medium Priority
- [ ] Socket reconnection — simplify `setupSocket` logic, reuse `io` instance across room switches
- [ ] Hardpoint scoring — server-authoritative score updates independent of client emits
- [ ] Player spawn — don't show on leaderboard until first spawned in current round
- [ ] Bot self-damage — Rocketeer/Nademan bots fire at targets inside their own blast
      radius and suicide; `BOT_PREFERRED_RANGE` doesn't account for splash
- [ ] Shared weapon objects — `Game.weapons` is one `structuredClone` per room, so
      `spreadIndex` and `camo` are shared by every player in that room

### Low Priority
- [ ] Character jump strength variation per class
- [ ] Wall clipping fix — head through wall when jumping against bottom
- [ ] Spawn positioning — players shouldn't appear inside walls after countdown
- [ ] Bullet behavior — overshoot fix at wall corners, double-fire on quick weapon switch
- [ ] Bullet holes on non-explosive barrels (render order consideration)

### Completed
- [x] Remote-player interpolation — snapshot buffer + render delay; bots move on the
      position tick instead of in 100ms jumps, and remote jumps now render
- [x] Movement time budget — per-packet delta clamping alone allowed ~25x speed by
      flooding inputs; simulated time can no longer outrun wall-clock
- [x] `cSrv` host check — permanent rooms have no host secret, and `null !== null`
      let any client password-lock or restart the public rooms
- [x] Trusted-proxy client IP — socket.io saw only the proxy address, which capped
      the whole server at the per-IP connection limit
- [x] Security headers on the served app, not just `/api`
- [x] Clamped `targetD` / `jumpY` / `targetF` and server-side shot timestamps
- [x] Server-authoritative fire rate, ammo and class validation
- [x] Private rooms no longer affect stats, rank or quests
- [x] Room browser select-then-join (no more accidental click-out)
- [x] Room player limit enforcement (8 max, bots yield their slot)
- [x] Audio settings — master/music/effects volume and mute
- [x] Profile editing (username + channel)
- [x] Tile-grid collision lookup — wallCol 6x faster, bullets 2.5x faster
- [x] Mobile UI pass — responsive layout and on-screen touch controls
- [x] Quest system (daily, weekly, streak)
- [x] Modal close button → X cross at top-right
- [x] Account system with login/register/Discord OAuth
- [x] Crate reward system with animated opening
- [x] Cosmetic unlock progression
- [x] Clan system (create, join, invite, kick, leaderboard)
- [x] Friends list with online status
- [x] Room browser with mode filters
- [x] Settings persistence (localStorage)
- [x] Keybind customization
- [x] Mod pack loader
- [x] Docker deployment

</details>
