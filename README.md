# Gamesradar.info

Upcoming video game release tracker. Fully static, auto-updated, zero backend.

---

## How it works

```
n8n (scheduled)
  └─ IGDB API  ──────────────────────────────┐
                                             ▼
                                       games.json  (GitHub)
                                             │
                                    CF Pages build trigger
                                             │
                              ┌──────────────┘
                              ▼
                    fetch-trailers.js  (IGDB → youtubeId)
                              │
                              ▼
                    Eleventy static build
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              index.html          /games/[slug]/
              /calendar/          (1 page per game)
                              │
                              ▼
                    Cloudflare Pages  →  gamesradar.info
```

---

## Data pipeline

### 1 — n8n workflow (runs every 6 hours)

Authenticates with Twitch OAuth to get an IGDB token, then fires **4 parallel HTTP requests** to the IGDB `/games` endpoint with offsets of 0 / 500 / 1000 / 1500 to work around the 500-result per-request cap. Results are merged, deduplicated, and passed to a **JavaScript Code node** that normalises raw IGDB fields into the `games.json` schema (see below). The final node writes the file to GitHub via the REST API (GET sha → PUT content, base64-encoded).

IGDB query filter: `first_release_date > [now] & first_release_date < 1798675200` (end of 2026), platforms limited to PC / PS5 / Xbox / Switch, sorted by `hypes desc`.

### 2 — CF Pages build

Triggered either by a GitHub push or manually via deploy hook. Two steps run before Eleventy:

**`scripts/fetch-trailers.js`**
Calls IGDB `/games` with `fields id, videos.video_id` in batches of 500. For every game where `youtubeId` is `null` or `undefined`, it looks up the first YouTube video ID and writes it back into `games.json`. Games confirmed to have no trailer are set to `null` so they are never re-queried.

Requires: `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` (Twitch credentials).

**`npm run build`** — Eleventy builds the static site from the enriched `games.json`.

### 3 — Eleventy build

All game data lives in a single file: `src/_data/games.json`. Eleventy reads it and generates:

| Template | Output |
|---|---|
| `src/index.njk` | `/index.html` — grid view, HOT slider, filters |
| `src/calendar.njk` | `/calendar/index.html` — month agenda view |
| `src/game.njk` | `/games/[slug]/index.html` — one page per game (pagination) |

Custom filters in `.eleventy.js` handle all data transformations: `groupByMonth`, `topPerMonth`, `allGenres`, `topHype`, `dateFormat`, `dateDay`, etc. No client-side data fetching — everything is baked into the HTML at build time.

---

## Data model

Each entry in `games.json` looks like this:

```jsonc
{
  "id": 123456,               // IGDB numeric ID
  "slug": "elden-ring",       // IGDB slug → URL path
  "title": "Elden Ring",
  "releaseDate": "2026-09-15",
  "platforms": ["PC", "PS5", "Xbox"],
  "genres": ["RPG", "Action"],
  "hype": 1240,               // IGDB hypes count
  "cover": "https://images.igdb.com/...",
  "color": "teal",            // fallback cover gradient (cycles across 6 values)
  "summary": "...",
  "youtubeId": "dQw4w9WgXcQ", // first video from IGDB videos.video_id, or null
  "developers": ["FromSoftware"],
  "publishers": ["Bandai Namco"],
  "websites": [{ "url": "...", "type": "steam" }],
  "releases": [{ "platform": "PC", "date": "Sep 15, 2026", "region": "Worldwide" }],
  "similarGames": [{ "name": "...", "genres": [...], "rating": 9.1 }],
  "ageRatings": [{ "system": "PEGI", "rating": "18" }],
  "languageSupports": [{ "language": "English", "audio": true, "subtitles": true, "interface": true }],
  "themes": ["Fantasy", "Open World"],
  "gameModes": ["Single player", "Multiplayer"],
  "collections": ["Elden Ring"],
  "franchises": [],
  "engine": [],
  "alternativeNames": []
}
```

---

## Key files

```
.eleventy.js              Eleventy config — all filters and data transforms
src/
  _data/games.json        Single source of truth for all game data
  _includes/base.njk      Global HTML shell (header, footer, fonts)
  index.njk               Home page (grid + HOT slider + filters)
  calendar.njk            Calendar agenda page
  game.njk                Individual game detail page (paginated)
  assets/style.css        All styles — single file, no build step
scripts/
  fetch-trailers.js       Build-time IGDB enrichment for YouTube IDs
```

---

## Why fully static

IGDB imposes rate limits and requires OAuth. Calling it client-side on every page load would be slow, expensive, and expose credentials. Instead, n8n acts as the scheduled crawler and Cloudflare Pages acts as the CDN — the user gets pre-rendered HTML with zero API calls at runtime.
