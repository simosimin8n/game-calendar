#!/usr/bin/env node
/**
 * Fetches current prices from IsThereAnyDeal and writes them into games.json.
 *
 * Phase 1 (first run / when itadId is missing):
 *   Searches ITAD by game title to resolve the ITAD game ID.
 *   IDs are cached in games.json so this only runs once per game.
 *
 * Phase 2 (every run):
 *   Bulk-fetches current prices for all games that have an itadId.
 *   Stores bestPrice, bestStore, bestUrl, and a full deals[] array.
 *
 * Usage:
 *   ITAD_KEY=your_api_key node scripts/fetch-prices.js
 *
 * Get a free key at https://api.isthereanydeal.com
 */

const fs   = require('fs');
const path = require('path');

const GAMES_FILE = path.join(__dirname, '../src/_data/games.json');
const KEY        = process.env.ITAD_KEY;
const COUNTRY    = process.env.ITAD_COUNTRY || 'US';

if (!KEY) {
  console.error('Missing ITAD_KEY env var.');
  process.exit(1);
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

// ── Phase 1: resolve ITAD IDs by title search ──────────────────────────────
async function resolveIds(games) {
  const missing = games.filter(g => !g.itadId);
  if (missing.length === 0) { console.log('All ITAD IDs already cached.'); return; }

  console.log(`Resolving ITAD IDs for ${missing.length} games…`);
  let found = 0;

  for (const game of missing) {
    try {
      const data = await get('/games/search/v1', { title: game.title, results: 3 });
      const results = data?.results ?? data ?? [];

      // Pick the result whose title most closely matches
      const match = results.find(r =>
        r.title.toLowerCase() === game.title.toLowerCase()
      ) || results[0];

      if (match?.id) {
        game.itadId = match.id;
        found++;
      }
    } catch (err) {
      console.warn(`  ✗ ${game.title}: ${err.message}`);
    }

    await sleep(120); // ~8 req/s, well within free tier
  }

  console.log(`  Resolved ${found}/${missing.length} IDs.`);
}

// ── Phase 2: bulk fetch prices ─────────────────────────────────────────────
async function fetchPrices(games) {
  const withId = games.filter(g => g.itadId);
  if (withId.length === 0) { console.log('No games with ITAD IDs — skipping price fetch.'); return; }

  console.log(`Fetching prices for ${withId.length} games…`);
  const BATCH = 100;
  let updated = 0;

  for (let i = 0; i < withId.length; i += BATCH) {
    const batch = withId.slice(i, i + BATCH);
    const ids   = batch.map(g => g.itadId);

    process.stdout.write(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(withId.length / BATCH)}… `);

    try {
      const data = await post('/games/prices/v3', ids, { country: COUNTRY });

      for (const game of batch) {
        const entry = data[game.itadId];
        if (!entry?.list?.length) {
          // No current prices (unreleased / not listed yet)
          game.deals        = [];
          game.bestPrice    = null;
          game.bestStore    = null;
          game.bestUrl      = null;
          continue;
        }

        // Sort by price ascending
        const sorted = [...entry.list].sort(
          (a, b) => a.price.amount - b.price.amount
        );

        game.deals = sorted.map(item => ({
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
    } catch (err) {
      console.warn(`failed: ${err.message}`);
    }

    await sleep(200);
  }

  console.log(`  Updated prices for ${updated} games.`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));

  await resolveIds(games);
  await fetchPrices(games);

  // Stamp the update time
  const meta = { pricesUpdatedAt: new Date().toISOString() };
  fs.writeFileSync(
    path.join(__dirname, '../src/_data/prices-meta.json'),
    JSON.stringify(meta, null, 2)
  );

  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
  console.log('\nDone. games.json updated.');
}

main().catch(err => { console.error(err); process.exit(1); });
