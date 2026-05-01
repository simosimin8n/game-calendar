#!/usr/bin/env node
/**
 * Fetches YouTube trailer IDs from IGDB for games that don't have one yet.
 * Runs during Cloudflare Pages build — reads/writes games.json locally.
 *
 * IDs are cached in games.json so IGDB is only queried for new games.
 *
 * Env vars required:
 *   IGDB_CLIENT_ID     — Twitch/IGDB client ID
 *   IGDB_CLIENT_SECRET — Twitch/IGDB client secret
 */

const fs   = require('fs');
const path = require('path');

const GAMES_FILE    = path.join(__dirname, '../src/_data/games.json');
const CLIENT_ID     = process.env.IGDB_CLIENT_ID;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('⚠️  IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set — skipping trailer fetch.');
  process.exit(0);
}

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const text = await res.text();
    console.warn(`⚠️  Twitch auth failed (${res.status}): ${text} — skipping trailer fetch.`);
    process.exit(0);
  }
  const { access_token } = await res.json();
  console.log('✓ IGDB token obtained.');
  return access_token;
}

async function fetchTrailers(games, token) {
  // Only query games that don't have a youtubeId yet (null = no trailer on IGDB, undefined = not fetched yet)
  const missing = games.filter(g => g.youtubeId === undefined);
  if (!missing.length) {
    console.log('All YouTube IDs already resolved, skipping.');
    return;
  }

  console.log(`Fetching YouTube IDs for ${missing.length} games…`);
  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch  = missing.slice(i, i + BATCH);
    const ids    = batch.map(g => g.id).join(',');
    const batchN = `${Math.floor(i / BATCH) + 1}/${Math.ceil(missing.length / BATCH)}`;
    process.stdout.write(`  Batch ${batchN}… `);

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID':     CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'text/plain',
      },
      body: `fields id, videos.video_id; where id = (${ids}); limit ${BATCH};`,
    });

    if (!res.ok) {
      console.warn(`failed (${res.status}): ${await res.text()}`);
      continue;
    }

    const data  = await res.json();
    const idMap = {};
    for (const item of data) {
      idMap[item.id] = (item.videos || [])[0]?.video_id ?? null;
    }

    for (const game of batch) {
      // Set to null explicitly if no trailer — prevents re-querying on next build
      game.youtubeId = idMap[game.id] ?? null;
      if (game.youtubeId) updated++;
    }

    console.log('done');
  }

  console.log(`  Trailers found for ${updated}/${missing.length} games.`);
}

async function main() {
  const token = await getToken();
  const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
  await fetchTrailers(games, token);
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
  console.log('Done — games.json updated with YouTube IDs.');
}

main().catch(err => { console.error(err); process.exit(1); });
