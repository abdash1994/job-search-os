# Job Search OS — Pitch Deck

---

## The Problem

Remote job seekers waste **3–5 hours daily** across 10+ job boards — copy-pasting, re-filtering, re-applying to jobs they've already seen, and having no idea which listings actually match their skills.

Existing platforms either:
- Show stale jobs (days old before you see them)
- Have no personalisation (every user sees the same feed)
- Charge $30–$100/month for features that should be free
- Don't work well on mobile (60% of job searches now happen on phones)

---

## The Solution — Job Search OS

A single, intelligent dashboard that **replaces all 10 job boards** with one clean feed — personalised to your resume, always fresh, tracks what you've applied to, and costs nothing to run.

---

## How It Works

```
Every 6 hours (automated, free)
        ↓
Scrapes 10 remote job boards simultaneously
        ↓
Deduplicates + normalises all listings
        ↓
Scores every job against YOUR resume (0–100 relevance)
        ↓
Your dashboard shows only fresh, relevant, unapplied jobs
```

---

## The 10 Sources

| Source | Method | Jobs/day |
|---|---|---|
| We Work Remotely | RSS feed | ~50 |
| Working Nomads | Public API | ~80 |
| Remote.co | RSS feed | ~30 |
| NoDesk | HTML scraper | ~40 |
| Remote100K | HTML scraper | ~30 |
| SkipTheDrive | HTML scraper | ~50 |
| JustRemote | HTML scraper | ~40 |
| Top Startups | HTML scraper | ~60 |
| Wellfound | Playwright (stealth) | ~100 |
| Crunchbase | Playwright + Tor | ~50 |
| **Total** | | **~530 fresh jobs/day** |

---

## Key Features

### For the Job Seeker
- **Resume Scoring** — upload once, every job gets a 0–100 relevance score with skill breakdown
- **Never see the same job twice** — applied jobs auto-hide from your feed
- **Filters that actually matter** — source, country, state, job type, salary range, posted date, min score
- **Application pipeline** — track Saved → Applied → Interviewing → Offer in a kanban view
- **Works on your phone** — installable PWA, mobile-first design, works like a native app on Android

### For the Platform
- **Self-healing scraper** — auto-rotates proxies when blocked, falls back to Tor
- **Anti-detection** — playwright-stealth, 40+ browser fingerprints, human-like delays
- **Pluggable AI scoring** — TF-IDF now (free), swap to Claude/Gemini with one env var change
- **Realtime** — Supabase Realtime pushes new jobs to your dashboard as they're scraped

---

## Zero Cost Architecture

| Service | Role | Cost |
|---|---|---|
| GitHub | Code + scraper automation (Actions) | Free |
| Supabase | Database + Auth + Realtime | Free |
| Vercel | Web dashboard hosting | Free |
| Proxy pool | Free public proxy APIs | Free |
| **Total** | | **$0/month** |

Runs entirely on permanent free tiers. No credit card ever needed.

---

## Competitive Landscape

| Platform | Fresh data | Resume scoring | Applied tracking | Mobile PWA | Cost |
|---|---|---|---|---|---|
| **Job Search OS** | ✅ Every 6h | ✅ 0–100 score | ✅ Full pipeline | ✅ Installable | **$0** |
| LinkedIn Jobs | ⚠️ Hours old | ❌ | ❌ | ⚠️ App required | Free/$40/mo |
| Indeed | ⚠️ Hours old | ❌ | ❌ basic | ⚠️ App required | Free |
| Wellfound | ✅ | ❌ | ❌ | ❌ | Free |
| Huntr | ❌ Manual | ❌ | ✅ | ❌ | $20/mo |
| Teal | ❌ Manual | ✅ basic | ✅ | ❌ | $29/mo |

---

## Traction Plan

| Phase | Goal | Timeline |
|---|---|---|
| **Alpha** | 100 users, validate core scraping + scoring | Weeks 1–2 |
| **Beta** | 1,000 users, add email digest, browser extension | Month 2 |
| **Growth** | 10,000 users, premium features (AI scoring, bulk apply) | Month 3–6 |
| **Monetise** | $9/mo premium tier: AI scoring, resume tailoring, auto-apply | Month 6+ |

---

## Revenue Model (Future)

**Free tier** — everything currently built, forever free for 100 concurrent users  
**Premium tier ($9/month)** — Claude/Gemini resume scoring, auto-apply, priority scraping, job alerts via email/WhatsApp  
**API tier ($49/month)** — raw job feed API for developers, ATS integrations

At 1,000 premium users → **$9,000 MRR** with near-zero infrastructure cost.

---

## Built By

**Aditya Bikram Dash** — Product specialist, 5+ years delivering platform products  
GitHub: [abdash1994](https://github.com/abdash1994) · LinkedIn: [adityabikramdash](https://linkedin.com/in/adityabikramdash)

---

## The Ask

Currently in private beta — testing with 100 users before public launch.  
Looking for: early users, feedback, and potential co-founders/contributors.

**Try it:** [job-search-os.vercel.app](https://job-search-os.vercel.app)  
**Code:** [github.com/abdash1994/job-search-os](https://github.com/abdash1994/job-search-os) (private, available on request)
