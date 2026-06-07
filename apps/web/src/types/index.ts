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

export type SortBy = 'score' | 'date_posted' | 'date_scraped';

// ---------------------------------------------------------------------------
// Core data models (mirror Supabase schema)
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  job_type: JobType | null;
  description: string | null;
  url: string;
  source: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  posted_at: string | null;
  scraped_at: string;
  is_remote: boolean;
  created_at: string;
}

export interface UserJob {
  id: string;
  user_id: string;
  job_id: string;
  status: JobStatus;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
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
  user_id: string;
  resume_text: string | null;
  resume_uploaded_at: string | null;
  preferred_roles: string[];
  preferred_locations: string[];
  min_salary: number | null;
  job_types: JobType[];
  skills: string[];
  created_at: string;
  updated_at: string;
}

export interface ScraperRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  jobs_found: number;
  jobs_new: number;
  status: 'running' | 'success' | 'failed' | 'partial';
  error_message: string | null;
  proxy_used: string | null;
  created_at: string;
}

export interface ProxyEntry {
  id: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  username: string | null;
  is_active: boolean;
  success_count: number;
  failure_count: number;
  last_used_at: string | null;
  last_success_at: string | null;
  response_time_ms: number | null;
  created_at: string;
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
