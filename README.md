# Job Search OS

> Stop wasting 3 hours a day across 10 job boards. One dashboard. Every remote job. Scored against your resume. Free forever.

**Live demo:** [job-search-os.vercel.app](https://job-search-os.vercel.app) · **Pitch deck:** [PITCH.md](./PITCH.md) · **Setup guide:** [SETUP.md](./SETUP.md)

---

## What it does

- Scrapes **10 remote job boards every 6 hours** automatically — We Work Remotely, Working Nomads, Wellfound, Crunchbase, NoDesk, Remote100K, JustRemote, SkipTheDrive, Remote.co, Top Startups
- Scores every job **0–100 against your resume** (upload once, scored forever)
- Hides jobs you've **already applied to** — you only see fresh opportunities
- Tracks your full **application pipeline** — Saved → Applied → Interviewing → Offer
- **Mobile-first PWA** — install on Android home screen, works offline
- Supports **100 users simultaneously**, all on free infrastructure

---

## Features

| | |
|---|---|
| 🔍 **Smart filters** | Source, country, state, job type, salary, posted date, min relevance score |
| 📄 **Resume scoring** | TF-IDF cosine similarity — skill match %, title match, experience fit |
| 📋 **Applied tracker** | Kanban pipeline with inline notes |
| 📊 **Analytics** | Jobs/day chart, source breakdown, application funnel, scraper health |
| 🛡️ **Anti-detection** | Free proxy rotation + Tor fallback + playwright-stealth + human delays |
| 🔌 **Upgradeable AI** | Swap TF-IDF for Claude/Gemini with one env var: `SCORING_PROVIDER=claude` |

---

## Tech stack

```
Frontend          Next.js 14 (App Router) + TypeScript + Tailwind CSS
Database + Auth   Supabase (PostgreSQL + Row Level Security)
Scraper           Python 3.11 + Playwright + BeautifulSoup + APScheduler
Anti-detection    playwright-stealth + free proxy pool + Tor SOCKS5
Scoring           TF-IDF cosine similarity (local, zero cost)
Hosting           Vercel (frontend) + GitHub Actions (scraper cron)
```

---

## Zero cost — forever

| Service | Usage | Cost |
|---|---|---|
| Vercel | Dashboard hosting | Free |
| Supabase | Database + Auth + Realtime | Free |
| GitHub Actions | Scraper runs every 6h | Free (≈1,200 min/mo) |
| Proxies | Free public proxy APIs | Free |
| **Total** | | **$0/month** |

---

## Quick start (15 minutes)

See **[SETUP.md](./SETUP.md)** for the complete guide — Mac, Windows, and Docker instructions.

```bash
git clone https://github.com/abdash1994/job-search-os.git
cd job-search-os
cp .env.example .env        # fill in 3 Supabase keys
make setup                  # installs all dependencies
make dev                    # dashboard at http://localhost:3000
make scrape-once            # run scraper once to populate jobs
```

---

## Repository structure

```
job-search-os/
├── apps/web/               Next.js 14 dashboard (Vercel)
├── scraper/                Python scraper engine (GitHub Actions)
│   ├── scrapers/           10 site-specific scrapers
│   ├── proxy/              Free proxy pool + Tor fallback
│   ├── anti_detect/        playwright-stealth + UA rotation
│   ├── scoring/            TF-IDF scorer + Claude/Gemini stubs
│   └── pipeline/           Dedup, normalise, write to Supabase
├── supabase/migrations/    Database schema (run once)
├── .github/workflows/      Scraper cron + proxy refresh
├── vercel.json             Vercel build config
├── SETUP.md                Full setup guide (Mac + Windows)
└── PITCH.md                Product pitch deck
```

---

## Upgrading to paid AI scoring

Currently free TF-IDF. To switch to Claude or Gemini:

```bash
# .env
SCORING_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

The `ScoringProvider` interface is already implemented — stub classes for Claude, Gemini, and HuggingFace are ready in `scraper/scoring/providers/`.

---

## Author

**Aditya Bikram Dash** — Product specialist, 5+ years in platform products  
[github.com/abdash1994](https://github.com/abdash1994) · [linkedin.com/in/adityabikramdash](https://linkedin.com/in/adityabikramdash)

---

*Private beta — testing with 100 users. Star to follow progress.*
