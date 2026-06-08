-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Add viewed tracking + last_visit to support new/viewed badges
-- Run in Supabase SQL Editor after 001_initial.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Track when a user last viewed a specific job
ALTER TABLE user_jobs ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Track when a user last visited the job feed (for "X new jobs" banner)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_feed_visit TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient "new since last visit" queries
CREATE INDEX IF NOT EXISTS idx_jobs_scraped_recent ON jobs(scraped_at DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_jobs_viewed ON user_jobs(user_id, viewed_at);
