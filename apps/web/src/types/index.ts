// ---------------------------------------------------------------------------
// Enums / union types
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'new'
  | 'saved'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected';

export type JobType = 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship';

export type SortBy = 'relevance_score' | 'date_posted' | 'scraped_at';

// ---------------------------------------------------------------------------
// Core data models (mirror Supabase schema)
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  state_region: string | null;
  job_type: JobType | null;
  description: string | null;
  url: string;
  source: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  job_categories: string[] | null;
  skills_required: string[] | null;
  posted_at: string | null;
  scraped_at: string;
  is_active: boolean;
  raw_data: Record<string, unknown> | null;
}

export interface UserJob {
  id: string;
  user_id: string;
  job_id: string;
  status: JobStatus;
  relevance_score: number | null;
  relevance_breakdown: ScoreBreakdown | null;
  notes: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from jobs table
  job: Job;
}

export interface ScoreBreakdown {
  skills_score: number;
  title_score: number;
  experience_score: number;
  overall: number;
}

export interface UserProfile {
  id: string;
  resume_text: string | null;
  resume_parsed: Record<string, unknown>;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScraperRun {
  id: string;
  source: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  jobs_found: number;
  jobs_new: number;
  status: 'running' | 'success' | 'blocked' | 'error';
  error_message: string | null;
  proxy_used: string | null;
}

export interface ProxyEntry {
  id: string;
  proxy_url: string;
  proxy_type: string;
  is_active: boolean;
  last_used: string | null;
  last_checked: string | null;
  success_count: number;
  fail_count: number;
  avg_latency_ms: number | null;
  country: string | null;
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

export interface JobFilters {
  sources: string[];
  jobTypes: JobType[];
  country: string;
  salaryMin: number;
  salaryMax: number;
  postedWithinDays: number | null;
  minScore: number;
  showApplied: boolean;
  sortBy: SortBy;
  page: number;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface PaginatedJobs {
  jobs: UserJob[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ScraperStatus {
  runs: ScraperRun[];
  proxies: {
    active: number;
    total: number;
    avgSuccessRate: number;
    lastRefreshed: string | null;
  };
  perSite: Record<string, SiteStatus>;
}

export interface SiteStatus {
  source: string;
  lastSuccess: string | null;
  lastRun: string | null;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  failureCount: number;
  jobsLastRun: number;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface DailyJobCount {
  date: string;
  count: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface SkillCount {
  skill: string;
  count: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}
