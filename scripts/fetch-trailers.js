#!/usr/bin/env node
/**
 * Fetches YouTube trailer IDs from IGDB and writes them into games.json.
 *
 * Usage:
 *   IGDB_CLIENT_ID=xxx IGDB_TOKEN=yyy node scripts/fetch-trailers.js
 *
 * Get credentials at https://api-docs.igdb.com/#getting-started
 * (free Twitch Developer account → Client ID + App Access Token)
 */

const fs   = require('fs');
const path = require('path');

const GAMES_FILE = path.join(__dirname, '../src/_data/games.json');
const CLIENT_ID  = process.env.IGDB_CLIENT_ID;
const TOKEN      = process.env.IGDB_TOKEN;

if (!CLIENT_ID || !TOKEN) {
  console.error('Missing credentials. Set IGDB_CLIENT_ID and IGDB_TOKEN env vars.');
  process.exit(1);
}

async function igdbPost(endpoint, body) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
  const ids   = games.map(g => g.id);

  // Build a map: igdbGameId → first YouTube video_id
  const videoMap = {};
  const BATCH    = 100;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    process.stdout.write(`Fetching videos ${i + 1}–${Math.min(i + BATCH, ids.length)} / ${ids.length}…`);

    const videos = await igdbPost(
      'game_videos',
      `fields video_id, game; where game = (${batch.join(',')}); limit 500;`
    );

    for (const v of videos) {
      if (!videoMap[v.game]) videoMap[v.game] = v.video_id;
    }

    console.log(` got ${videos.length} videos`);
    await new Promise(r => setTimeout(r, 250)); // respect rate limit
  }

  let updated = 0;
  for (const game of games) {
    const id = videoMap[game.id];
    if (id && game.youtubeId !== id) {
      game.youtubeId = id;
      updated++;
    }
  }

  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
  console.log(`\nDone — ${updated} games updated with YouTube trailer IDs.`);
}

main().catch(err => { console.error(err); process.exit(1); });
