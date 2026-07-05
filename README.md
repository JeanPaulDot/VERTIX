# VERTIX ONLINE

A web-based multiplayer arena shooter — a modern revival of Vertix Online. Built with Svelte 5, Hono, Socket.IO, and SQLite.

## Features

### Gameplay
- **9 Game Modes**: Free For All, Team Deathmatch, Hardpoint, Lootcrate, Sniper War, Boss Hunt, Zone War, Rocket War, Pyro War
- **6 Character Classes**: Triggerman, Detective, Hunter, Run N Gun, Vince, Rocketeer — each with unique primary/secondary weapons
- **24 Handcrafted Maps** with mode-specific rotations
- **Real-time multiplayer** via Socket.IO with room browser, private rooms, and room codes
- **Bot AI** for filling empty slots
- **Custom Mods** — load community texture packs via URL or local files

### Account & Progression
- **Account System** — register with username/password or Discord OAuth
- **Ranked Progression** — earn score to rank up (every 1,000 score), cosmetic unlocks at score milestones
- **Crate Reward System** — earn crates on rank up, open them for random cosmetics weighted by rarity
- **127 Hats, 133+ Camos, 70+ Shirts** — each with rarity tiers (Common → Legendary)

### Quest System
- **Daily Quests** — 3 random quests per day (UTC midnight rotation), earn score or crate rewards
- **Weekly Challenge** — 1 harder quest per week (Monday UTC rotation), earn crates
- **Login Streak** — consecutive daily logins build a 7-day streak, day 7 grants +1 crate
- **Quest Tracking** — progress tracked from kills, damage, wins, goals, healing per round
- **Claim Rewards** — click CLAIM on completed quests to receive score bonuses or crates

### Social
- **Clans** — create or join 4-letter clans, clan leaderboards, invite/kick members
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
| Auth | bcrypt + JWT (jose), Discord OAuth2 |
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
   CORS_ORIGINS=https://your-domain.com
   ```

2. (Optional) Set up Discord OAuth:
   ```
   DISCORD_CLIENT_ID=your-app-id
   DISCORD_CLIENT_SECRET=your-secret
   DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/discord/callback
   ```

3. Create the external network and start:
   ```bash
   docker network create vertix-net
   docker compose up -d
   ```

4. The server runs on ports `1118` (HTTP) and `1119` (Socket.IO in dev).

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
| 7 | +1 CRATE (resets streak) |

Quest score rewards are **bonus score** — they do not affect ranking.

---

<details>
<summary>TODO / Roadmap</summary>

### High Priority
- [ ] Quest variety — mode-specific quests (e.g. "Win 3 rounds of Hardpoint")
- [ ] Quest rarity tiers — daily/epic/legendary quest pools
- [ ] Seasonal events — limited-time quest chains with exclusive rewards
- [ ] Mobile UI pass — responsive layout for smaller screens
- [ ] Input validation overhaul — standard-schema integration for socket events
- [ ] Game over menu — finish moving from JSX to Svelte

### Medium Priority
- [ ] Room system improvements — clearer side effects, clean open/close for custom rooms
- [ ] Socket reconnection — simplify `setupSocket` logic, reuse `io` instance across room switches
- [ ] Hardpoint scoring — server-authoritative score updates independent of client emits
- [ ] Player spawn — don't show on leaderboard until first spawned in current round

### Low Priority
- [ ] Character jump strength variation per class
- [ ] Wall clipping fix — head through wall when jumping against bottom
- [ ] Room player limit enforcement (8 max)
- [ ] Accidental click-out protection — dedicated "join" button in room browser
- [ ] Spawn positioning — players shouldn't appear inside walls after countdown
- [ ] Bullet behavior — overshoot fix at wall corners, double-fire on quick weapon switch
- [ ] Bullet holes on non-explosive barrels (render order consideration)

### Completed
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
