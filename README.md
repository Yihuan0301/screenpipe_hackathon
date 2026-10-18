# FounderHUD

**Screen is the universal API.**

FounderHUD is a post-launch ops cockpit for indie developers. After you ship, revenue, costs, infra health, and user feedback live in nine different tabs. FounderHUD collapses them into four signals — **Revenue · Costs · Monitor · Feedback** — using:

- **Screenpipe** — sees what’s on the screen  
- **Playwright** — runs the workflow across consoles  
- **FounderHUD** — one place to decide  

Built for the Screenpipe hackathon.

---

## Project Description

After I ship an app, my morning is still a pile of websites. App Store Connect for revenue. Gmail for bills. Cloudflare, Netlify, Fly, Supabase, DeepSeek, Tencent Cloud for infra. App Store ratings and Rednote for what users say. I jump between tabs, copy numbers, and by the time I’m done the data is already old.

FounderHUD fixes that. It’s one dashboard for the four things I actually care about: **Revenue, Costs, Monitor, and Feedback**.

You open the pitch page, scroll into the cockpit, and hit **Global Sync**. A real Chrome window opens the same sites I use every day. We capture what’s on screen, parse the numbers, and fill the HUD — live data, not fake demo stats. You can also Sync just one module if you only need Feedback or Monitor.

The idea is simple: the sites stay where they are. You stop babysitting them by hand. Screen → workflow → one HUD.

---

## Technical Details

**Stack:** Next.js UI (FounderHUD pitch + cockpit), Playwright patrol scripts, and **Screenpipe** for local screen context.

**Screenpipe** runs on the machine (`localhost:3030`). While you work — or while patrol opens consoles — Screenpipe sees what’s on screen (OCR / screen context). The HUD checks that Screenpipe is healthy and can use that live signal so the product isn’t only “scrape a URL later”; it’s grounded in what actually appeared on the display.

**Playwright patrol** drives a real Chrome profile, opens App Store Connect, Gmail, CF / Netlify / Fly / Supabase / DeepSeek / Tencent Cloud, ratings, and Rednote notes, scrolls, and saves page text into a local cache. The cockpit API reads that cache and turns it into cards: revenue, costs, monitor health, and comment/feedback views.

**Global Sync** runs all four modules; each module Sync runs only that one. Screenpipe sees the screen. Patrol runs the workflow. FounderHUD shows what matters.

---

## Quick start

### Requirements

- macOS + Google Chrome  
- Node.js 18+  
- [Screenpipe](https://screenpi.pe) desktop app (API on `http://localhost:3030`)

### Setup

```bash
npm install
cp .env.local.example .env.local
```

Set in `.env.local`:

```bash
SCREENPIPE_API_KEY=your_key_here
```

Start Screenpipe, then:

```bash
# Terminal 1 — debug Chrome (login to your consoles once)
npm run chrome:debug

# Terminal 2 — app
npm run dev
```

Open **http://localhost:3000**

### Demo flow

1. **Opening slide** — the tab farm; click a tab or “four signals”  
2. **FounderHUD** — empty templates → fill cards → expand modules  
3. **Closing slide** — Before → Now → core tech (screenpipe + Playwright)

**3-minute live pitch:** Global Sync takes ~3 minutes end-to-end — don’t wait on stage.

1. Backstage: run **Global Sync** once (or `npm run patrol:core`) so `data/patrol-cache.json` is warm  
2. On stage: **Reset blank** → talk → hit **Fill HUD** (instant inject from last cache)  
3. Optional: open one console in Chrome for 10s as proof, then Fill HUD  
4. Judges who want the full crawl can press **Global Sync** after the pitch

---

## Architecture (simple)

| Layer | Role |
|-------|------|
| Screenpipe (`:3030`) | Local OCR / screen context |
| Playwright patrol | Opens real dashboards, scrolls, captures page text |
| FounderHUD UI | Pitch deck + live cockpit |

Global Sync runs the full patrol (`npm run patrol:core` / UI button) across revenue, costs, monitor, and feedback targets.

---

## Data sources (patrol targets)

Configured in `config/patrol-targets.js`. **Personal console URLs live in `.env.local` only** (gitignored) — see `.env.local.example`.

| Module | Sources |
|--------|---------|
| Revenue | App Store Connect — Trends |
| Costs | Gmail billing / receipts search |
| Monitor | Cloudflare · Netlify · Fly.io · Supabase · DeepSeek · Tencent Cloud |
| Feedback | App Store Connect — Ratings · Rednote notes |

Set deep links in `.env.local`, for example:

```bash
PATROL_CLOUDFLARE_URL=...
PATROL_NETLIFY_URL=...
PATROL_FLY_URL=...
PATROL_SUPABASE_URL=...
PATROL_TENCENT_URL=...
PATROL_ASC_RATINGS_URL=...
PATROL_XHS_NOTE_URLS=url1,url2
```

---

## Commands

```bash
npm run chrome:debug    # Debug Chrome for console logins
npm run dev             # UI at http://localhost:3000
npm run patrol:core     # Full patrol (same as Global Sync)
npm run patrol:comments # Feedback targets only
```

If a patrol gets stuck:

```bash
pkill -f "node scripts/patrol.js" || true
rm -f data/.patrol.lock
```

---

## Notes for reviewers

- Keep Screenpipe running so the HUD shows **Screenpipe Live**  
- Use the debug Chrome profile for Sync — not your everyday browser  
- `.env.local` and `data/` are gitignored (secrets / capture cache)  
- Cards start empty on purpose for the pitch; **Global Sync** injects real consoles, not mock numbers  

---

## One line

**See the screen. Run the workflow. Get what matters.**
