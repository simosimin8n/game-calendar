#!/usr/bin/env node
/**
 * Fetches current prices from IsThereAnyDeal.
 * Runs during Cloudflare Pages build — reads/writes games.json locally.
 *
 * Phase 1: resolve ITAD game IDs by title search (skips games that already
 *           have itadId cached in games.json from a previous n8n run).
 * Phase 2: bulk-fetch current prices for all games with an itadId.
 *
 * Env vars required:
 *   ITAD_KEY      — your IsThereAnyDeal API key
 *   ITAD_COUNTRY  — optional, defaults to US
 */

const fs   = require('fs');
const path = require('path');

const GAMES_FILE = path.join(__dirname, '../src/_data/games.json');
const KEY        = process.env.ITAD_KEY;
const COUNTRY    = process.env.ITAD_COUNTRY || 'US';

if (!KEY) {
  console.warn('⚠️  ITAD_KEY not set — skipping price fetch.');
  process.exit(0); // exit 0 so the build doesn't fail
}

const BASE = 'https://api.isthereanydeal.com';

async function get(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  url.searchParams.set('key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function post(endpoint, body, params = {}) {
  const url = new URL(BASE + endpoint);
  url.searchParams.set('key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Phase 1 — resolve ITAD IDs for games that don't have one yet
async function resolveIds(games) {
  const missing = games.filter(g => !g.itadId);
  if (!missing.length) { console.log('All ITAD IDs already cached, skipping search.'); return; }

  console.log(`Resolving ITAD IDs for ${missing.length} games…`);
  let found = 0;
  for (const game of missing) {
    try {
      const data = await get('/games/search/v1', { title: game.title, results: 3 });
      const results = data?.results ?? [];
      const match = results.find(r =>
        r.title.toLowerCase() === game.title.toLowerCase()
      ) || results[0];
      if (match?.id) { game.itadId = match.id; found++; }
    } catch (e) {
      console.warn(`  ✗ ${game.title}: ${e.message}`);
    }
    await sleep(120);
  }
  console.log(`  Resolved ${found}/${missing.length} IDs.`);
}

// Phase 2 — bulk fetch prices in batches of 100
async function fetchPrices(games) {
  const withId = games.filter(g => g.itadId);
  if (!withId.length) { console.log('No ITAD IDs found — skipping price fetch.'); return; }

  console.log(`Fetching prices for ${withId.length} games…`);
  const BATCH = 100;
  let updated = 0;

  for (let i = 0; i < withId.length; i += BATCH) {
    const batch = withId.slice(i, i + BATCH);
    process.stdout.write(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(withId.length / BATCH)}… `);
    try {
      const data = await post('/games/prices/v3', batch.map(g => g.itadId), { country: COUNTRY });
      for (const game of batch) {
        const entry = data[game.itadId];
        if (!entry?.list?.length) {
          game.deals = []; game.bestPrice = null; game.bestStore = null; game.bestUrl = null;
          continue;
        }
        const sorted = [...entry.list].sort((a, b) => a.price.amount - b.price.amount);
        game.deals     = sorted.map(item => ({
          store:   item.shop.name,
          price:   item.price.amount,
          regular: item.price.regular?.amount ?? item.price.amount,
          cut:     item.price.cut ?? 0,
          url:     item.url,
        }));
        game.bestPrice = sorted[0].price.amount;
        game.bestStore = sorted[0].shop.name;
        game.bestUrl   = sorted[0].url;
        game.itadUrl   = entry.urls?.game ?? null;
        updated++;
      }
      console.log('done');
    } catch (e) {
      console.warn(`failed: ${e.message}`);
    }
    await sleep(200);
  }
  console.log(`  Prices updated for ${updated} games.`);
}

async function main() {
  const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
  await resolveIds(games);
  await fetchPrices(games);
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
  console.log('Done — games.json updated with prices.');
}

main().catch(err => { console.error(err); process.exit(1); });
