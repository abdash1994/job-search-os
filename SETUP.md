# Setup Guide — Job Search OS

Complete step-by-step instructions for Mac and Windows. Takes about 15 minutes.

---

## What you'll need (all free)

| Account | Purpose | Sign up |
|---|---|---|
| GitHub | Hosts code + runs scraper automatically | github.com |
| Supabase | Database + user auth | app.supabase.com |
| Vercel | Hosts the web dashboard | vercel.com |

---

## Step 1 — Create your GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `job-search-os`
3. Set visibility to **Private**
4. Do NOT initialize with README (you'll push the existing code)
5. Click **Create repository**

You'll see a page with push instructions. Keep it open.

---

## Step 2 — Set up Supabase

1. Go to [app.supabase.com](https://app.supabase.com) → **New project**
2. Choose a name (e.g. `job-search-os`), region closest to you, strong password
3. Wait ~2 minutes for the project to be ready
4. Go to **SQL Editor** (left sidebar) → **New query**
5. Copy the entire contents of `supabase/migrations/001_initial.sql` and paste it → **Run**
6. You should see "Success. No rows returned" — the schema is created

**Get your API keys:**
- Go to **Project Settings** → **API**
- Copy:
  - `Project URL` → this is your `SUPABASE_URL`
  - `anon public` key → `SUPABASE_ANON_KEY`
  - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

---

## Step 3 — Configure environment variables

```bash
# In the job-search-os directory:
cp .env.example .env
```

Open `.env` and fill in the three Supabase values you just copied:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Leave everything else as defaults for now.

---

## Step 4 — Push to GitHub

```bash
cd "path/to/job-search-os"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/abdash1994/job-search-os.git
git push -u origin main
```

---

## Step 5 — Add GitHub Secrets (for the scraper)

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these three secrets:

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |

The scraper will now run automatically every 6 hours via GitHub Actions.

**To trigger it manually the first time:**
- Go to **Actions** tab → **Scrape Remote Jobs** → **Run workflow** → **Run workflow**

---

## Step 6 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Click **Import Git Repository** → connect your GitHub account → select `job-search-os`
3. Set **Root Directory** to `apps/web`
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key
5. Click **Deploy**

Your dashboard will be live at `https://job-search-os-xxxx.vercel.app` in about 2 minutes.

---

## Step 7 — First login

1. Open your Vercel URL
2. Click **Sign up** — create your account
3. Go to **Resume** tab → paste or upload your resume
4. Wait for the scraper to run (or trigger it manually from GitHub Actions)
5. Jobs will appear in the **Jobs** tab with relevance scores

---

## Local Development Setup

### Mac / Linux

```bash
# Prerequisites: Node 20+, Python 3.11+
# Install Homebrew if needed: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node python@3.11

# Clone and set up
git clone https://github.com/abdash1994/job-search-os.git
cd job-search-os
cp .env.example .env
# Edit .env with your Supabase keys

make setup   # installs all dependencies
make dev     # starts the web dashboard at http://localhost:3000
```

To run the scraper locally (one-time):
```bash
make scrape-once
```

### Windows (recommended: WSL2)

**Option A — WSL2 (recommended, easiest)**

1. Open PowerShell as Administrator:
   ```powershell
   wsl --install
   # Restart your machine
   ```
2. Open **Ubuntu** from Start menu → follow Mac/Linux instructions above inside WSL2

**Option B — Native Windows (Git Bash)**

1. Install [Node 20 LTS](https://nodejs.org/en/download) — check "Add to PATH"
2. Install [Python 3.11](https://www.python.org/downloads/windows/) — check "Add Python to PATH"
3. Install [Git for Windows](https://git-scm.com/download/win) (includes Git Bash)
4. Open **Git Bash**:
   ```bash
   git clone https://github.com/abdash1994/job-search-os.git
   cd job-search-os
   cp .env.example .env
   # Edit .env with Notepad: notepad .env

   # Install web deps
   cd apps/web && npm install && cd ../..

   # Install Python deps
   cd scraper
   pip install -r requirements.txt
   python -m playwright install chromium
   cd ..

   # Start dashboard
   cd apps/web && npm run dev
   ```

**Option C — Docker Desktop (no local Python/Node needed)**

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Enable WSL2 integration in Docker Desktop settings
3. Open PowerShell:
   ```powershell
   git clone https://github.com/abdash1994/job-search-os.git
   cd job-search-os
   copy .env.example .env
   # Edit .env in Notepad
   docker compose up
   ```
4. Open `http://localhost:3000`

---

## Making the Repository Public Later

When you're ready to open-source or share:

1. Go to GitHub repo → **Settings** → scroll to **Danger Zone**
2. Click **Change visibility** → **Make public** → confirm

Nothing in the architecture changes. All secrets remain in GitHub Secrets (never in code).

---

## Switching to Paid AI Scoring (Future)

When you're ready to upgrade from TF-IDF to Claude or Gemini:

1. Add your API key to GitHub Secrets and `.env`:
   - Claude: `ANTHROPIC_API_KEY`
   - Gemini: `GOOGLE_AI_API_KEY`
2. Change one line in `.env`:
   ```
   SCORING_PROVIDER=claude   # or gemini, huggingface
   ```
3. Push to GitHub — done. The scraper picks up the new provider automatically.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Scraper says "blocked" on a site | Wait for the proxy pool to refresh (runs daily), or manually trigger `proxy-refresh` workflow |
| Dashboard shows no jobs | Trigger the scraper manually in GitHub Actions → wait 10 min |
| Login redirect loop | Clear browser cookies, or check Supabase URL in Vercel env vars |
| Windows: `playwright install` fails | Run as Administrator, or use WSL2/Docker |
| Port 3000 in use | `npx kill-port 3000` then `npm run dev` |
