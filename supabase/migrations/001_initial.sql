-- ─────────────────────────────────────────────────────────────────────────────
-- Job Search OS — Initial Schema
-- Run this once in your Supabase project: SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Jobs (shared pool — all users see the same scraped jobs) ─────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source          VARCHAR(50)  NOT NULL,
  source_id       VARCHAR(255),
  title           VARCHAR(255) NOT NULL,
  company         VARCHAR(255),
  url             TEXT         NOT NULL UNIQUE,
  description     TEXT,
  location        VARCHAR(255),
  country         VARCHAR(100),
  state_region    VARCHAR(100),
  job_type        VARCHAR(50),   -- full-time | contract | part-time | internship
  salary_min      INTEGER,
  salary_max      INTEGER,
  salary_currency VARCHAR(10)  DEFAULT 'USD',
  job_categories  TEXT[]       DEFAULT '{}',
  skills_required TEXT[]       DEFAULT '{}',
  posted_at       TIMESTAMPTZ,
  scraped_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN      DEFAULT TRUE,
  raw_data        JSONB        DEFAULT '{}'
);

CREATE INDEX idx_jobs_source       ON jobs(source);
CREATE INDEX idx_jobs_posted_at    ON jobs(posted_at DESC);
CREATE INDEX idx_jobs_scraped_at   ON jobs(scraped_at DESC);
CREATE INDEX idx_jobs_country      ON jobs(country);
CREATE INDEX idx_jobs_job_type     ON jobs(job_type);
CREATE INDEX idx_jobs_is_active    ON jobs(is_active);
-- Full-text search on title + company + description
CREATE INDEX idx_jobs_fts ON jobs USING GIN (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'') || ' ' || coalesce(description,''))
);

-- ─── User Profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_text     TEXT,
  resume_parsed   JSONB DEFAULT '{}',  -- {skills: [], experience_years: 0, titles: []}
  preferences     JSONB DEFAULT '{}',  -- {roles: [], locations: [], min_salary: 0, job_types: []}
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── User Jobs (per-user status + scores) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_jobs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status               VARCHAR(50) DEFAULT 'new',
                       -- new | saved | applied | interviewing | offer | rejected
  relevance_score      DECIMAL(5,2),   -- 0-100
  relevance_breakdown  JSONB DEFAULT '{}',
                       -- {title_match, skills_match, experience_match, matched_skills, missing_skills}
  applied_at           TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

CREATE INDEX idx_user_jobs_user_id ON user_jobs(user_id);
CREATE INDEX idx_user_jobs_job_id  ON user_jobs(job_id);
CREATE INDEX idx_user_jobs_status  ON user_jobs(status);
CREATE INDEX idx_user_jobs_score   ON user_jobs(relevance_score DESC);

-- ─── Scraper Runs (audit log) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source        VARCHAR(50) NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  jobs_found    INTEGER DEFAULT 0,
  jobs_new      INTEGER DEFAULT 0,
  status        VARCHAR(50) DEFAULT 'running',
                -- running | success | blocked | error
  error_message TEXT,
  proxy_used    VARCHAR(255),
  duration_ms   INTEGER
);

CREATE INDEX idx_scraper_runs_source     ON scraper_runs(source);
CREATE INDEX idx_scraper_runs_started_at ON scraper_runs(started_at DESC);

-- ─── Proxy Pool ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proxy_pool (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proxy_url        VARCHAR(255) NOT NULL UNIQUE,
  proxy_type       VARCHAR(20)  DEFAULT 'http',  -- http | socks5 | tor
  is_active        BOOLEAN      DEFAULT TRUE,
  last_used        TIMESTAMPTZ,
  last_checked     TIMESTAMPTZ  DEFAULT NOW(),
  success_count    INTEGER      DEFAULT 0,
  fail_count       INTEGER      DEFAULT 0,
  avg_latency_ms   INTEGER      DEFAULT 0,
  country          VARCHAR(10)
);

CREATE INDEX idx_proxy_pool_active  ON proxy_pool(is_active);
CREATE INDEX idx_proxy_pool_success ON proxy_pool(success_count DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- jobs: readable by everyone (authenticated), writable only by service role
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Jobs are viewable by authenticated users"
  ON jobs FOR SELECT
  TO authenticated
  USING (true);
-- service_role bypasses RLS by default, so scraper writes work automatically

-- user_profiles: users can only read/write their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- user_jobs: users can only see/modify their own job interactions
ALTER TABLE user_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own job interactions"
  ON user_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own job interactions"
  ON user_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own job interactions"
  ON user_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own job interactions"
  ON user_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- scraper_runs: readable by authenticated users (for status page), writable by service role
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scraper runs viewable by authenticated users"
  ON scraper_runs FOR SELECT
  TO authenticated
  USING (true);

-- proxy_pool: readable by authenticated users (for status page), writable by service role
ALTER TABLE proxy_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Proxy pool viewable by authenticated users"
  ON proxy_pool FOR SELECT
  TO authenticated
  USING (true);

-- ─── Helpful view: jobs with user context ────────────────────────────────────
CREATE OR REPLACE VIEW jobs_with_user_context AS
SELECT
  j.*,
  uj.status           AS user_status,
  uj.relevance_score,
  uj.relevance_breakdown,
  uj.applied_at,
  uj.notes,
  uj.user_id
FROM jobs j
LEFT JOIN user_jobs uj ON j.id = uj.job_id;

-- ─── Function: get jobs feed for a user ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_jobs_feed(
  p_user_id         UUID,
  p_sources         TEXT[]    DEFAULT NULL,
  p_country         TEXT      DEFAULT NULL,
  p_job_type        TEXT      DEFAULT NULL,
  p_salary_min      INTEGER   DEFAULT NULL,
  p_salary_max      INTEGER   DEFAULT NULL,
  p_posted_days     INTEGER   DEFAULT NULL,
  p_min_score       DECIMAL   DEFAULT NULL,
  p_show_applied    BOOLEAN   DEFAULT FALSE,
  p_sort_by         TEXT      DEFAULT 'scraped_at',
  p_limit           INTEGER   DEFAULT 20,
  p_offset          INTEGER   DEFAULT 0
)
RETURNS TABLE (
  id UUID, source TEXT, title TEXT, company TEXT, url TEXT,
  location TEXT, country TEXT, state_region TEXT,
  job_type TEXT, salary_min INTEGER, salary_max INTEGER, salary_currency TEXT,
  skills_required TEXT[], posted_at TIMESTAMPTZ, scraped_at TIMESTAMPTZ,
  user_status TEXT, relevance_score DECIMAL, applied_at TIMESTAMPTZ, notes TEXT,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id, j.source::TEXT, j.title::TEXT, j.company::TEXT, j.url,
    j.location::TEXT, j.country::TEXT, j.state_region::TEXT,
    j.job_type::TEXT, j.salary_min, j.salary_max, j.salary_currency::TEXT,
    j.skills_required, j.posted_at, j.scraped_at,
    uj.status::TEXT    AS user_status,
    uj.relevance_score AS relevance_score,
    uj.applied_at,
    uj.notes,
    COUNT(*) OVER ()   AS total_count
  FROM jobs j
  LEFT JOIN user_jobs uj ON j.id = uj.job_id AND uj.user_id = p_user_id
  WHERE
    j.is_active = TRUE
    AND (p_sources  IS NULL OR j.source = ANY(p_sources))
    AND (p_country  IS NULL OR j.country ILIKE '%' || p_country || '%')
    AND (p_job_type IS NULL OR j.job_type = p_job_type)
    AND (p_salary_min IS NULL OR j.salary_max >= p_salary_min)
    AND (p_salary_max IS NULL OR j.salary_min <= p_salary_max)
    AND (p_posted_days IS NULL OR j.posted_at >= NOW() - (p_posted_days || ' days')::INTERVAL)
    AND (p_min_score IS NULL OR uj.relevance_score >= p_min_score OR uj.relevance_score IS NULL)
    AND (p_show_applied = TRUE OR COALESCE(uj.status, 'new') NOT IN ('applied', 'interviewing', 'offer', 'rejected'))
  ORDER BY
    CASE WHEN p_sort_by = 'relevance' THEN uj.relevance_score END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'posted_at' THEN j.posted_at END DESC NULLS LAST,
    j.scraped_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
