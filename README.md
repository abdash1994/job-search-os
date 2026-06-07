# Job Search OS

A self-sustaining remote job aggregator that scrapes 10 job boards every 6 hours, scores postings against your resume, and tracks your applications — all at **$0/month**.

Works on Mac, Windows, Android, and any modern browser.

---

## Features

- **10 job boards scraped automatically**: We Work Remotely, Working Nomads, Remote.co, NoDesk, Remote100K, SkipTheDrive, JustRemote, Top Startups, Wellfound, Crunchbase
- **Anti-detection**: Rotating free proxies + Tor fallback + playwright-stealth + human-like delays
- **Resume scoring**: Upload your resume → every job gets a 0–100 relevance score with skill breakdown
- **Application tracker**: Kanban pipeline — Saved → Applied → Interviewing → Offer
- **Rich filters**: Source, country, state, job type, salary, posted date, min relevance score
- **Mobile-first PWA**: Install on Android home screen, works like a native app
- **100% free**: Vercel + Supabase + GitHub Actions, all on free tiers
- **Upgradeable AI**: Swap from TF-IDF to Claude/Gemini scoring with one env var change

---

## Quick Start

See [SETUP.md](./SETUP.md) for the full 15-minute setup guide.

**Short version:**
1. Create free accounts: [GitHub](https://github.com), [Supabase](https://app.supabase.com), [Vercel](https://vercel.com)
2. Run Supabase migration SQL
3. Copy `.env.example` → `.env`, fill in 3 keys
4. Push to GitHub private repo
5. Add GitHub Secrets, connect Vercel → deploy

---

## Architecture

```
GitHub Repo (private)
├── GitHub Actions → Python scraper runs every 6h → writes to Supabase
├── Vercel → Next.js dashboard auto-deploys on every push
└── Supabase → PostgreSQL + Auth for all 100 users
```

**Zero recurring cost** — all services run on permanent free tiers.

---

## Scraper Coverage

| Site | Method | Anti-block |
|---|---|---|
| We Work Remotely | RSS feed | None needed |
| Working Nomads | Public JSON API | None needed |
| Remote.co | RSS feed | None needed |
| NoDesk | HTML | UA rotation + delays |
| Remote100K | HTML | UA rotation + delays |
| SkipTheDrive | HTML | UA rotation + delays |
| JustRemote | HTML | UA rotation + delays |
| Top Startups | HTML | UA rotation + delays |
| Wellfound | Playwright | Stealth + proxy |
| Crunchbase | Playwright | Stealth + proxy + Tor |

---

## Switching to Paid AI Scoring

Currently uses free TF-IDF scoring. To upgrade:

```bash
# .env
SCORING_PROVIDER=claude       # or gemini, huggingface
ANTHROPIC_API_KEY=sk-ant-...  # add your key
```

The `ScoringProvider` interface is already implemented — stub classes for Claude, Gemini, and HuggingFace are in `scraper/scoring/providers/`.

---

## Repository

GitHub: [github.com/abdash1994/job-search-os](https://github.com/abdash1994/job-search-os)  
Status: Private (make public when ready)

---

## License

MIT — free to use, modify, and share.
