# Game Calendar

Calendario uscite videogiochi auto-aggiornato con n8n + 11ty.

## Setup

```bash
npm install
npm start
```

Apri http://localhost:8080 nel browser.

## Build per produzione

```bash
npm run build
```

I file statici escono in `_site/`. Carica quella cartella ovunque (Cloudflare Pages, Netlify, GitHub Pages).

## Struttura

```
src/
  _data/games.json     ← n8n aggiorna QUESTO file
  _includes/base.njk   ← layout di base
  assets/style.css     ← stile (tema scuro)
  index.njk            ← homepage
  about.njk            ← pagina info
.eleventy.js           ← config 11ty
```

## Come si aggiorna

1. Workflow n8n ogni 6h scarica giochi da IGDB
2. Genera nuovo `src/_data/games.json`
3. Push su GitHub
4. Cloudflare Pages rebuilda e pubblica
