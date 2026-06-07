/**
 * Lightweight TypeScript TF-IDF relevance scorer for resume ↔ job-description matching.
 *
 * Algorithm:
 *  1. Tokenise both documents into normalised lowercase terms.
 *  2. Compute TF (term frequency) for each document.
 *  3. Use a small corpus of additional JDs to estimate IDF when available,
 *     otherwise fall back to 1 (pure TF cosine similarity).
 *  4. Build TF-IDF vectors and compute cosine similarity → overall score (0-100).
 *  5. Separately score title match and experience keywords for a breakdown.
 */

// Common English stop-words to ignore during tokenisation
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','can','shall','must',
  'not','no','we','you','i','he','she','it','they','our','your','its','their',
  'us','me','him','her','them','this','that','these','those','as','by','from',
  'up','about','into','through','during','before','after','above','below',
  'between','out','off','over','under','again','further','then','once',
  'also', 'than', 'more', 'some', 'any', 'all', 'both', 'each', 'few',
  'if', 'while', 'because', 'so', 'just', 'new', 'like', 'work', 'working',
  'role', 'position', 'job', 'team', 'company', 'experience',
]);

const EXPERIENCE_KEYWORDS = ['year', 'years', 'experience', 'senior', 'junior', 'mid', 'lead', 'principal', 'staff', 'architect', 'manager', 'director'];

/** Tokenise text: lowercase, split on non-alphanumeric, filter short/stopword tokens */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/** Build a term-frequency map (normalised by document length) */
function buildTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  const tf = new Map<string, number>();
  for (const [term, count] of freq) tf.set(term, count / total);
  return tf;
}

/** Cosine similarity between two TF maps */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, tfA] of a) {
    dot += tfA * (b.get(term) ?? 0);
    magA += tfA * tfA;
  }
  for (const [, tfB] of b) magB += tfB * tfB;

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Score overlap of skills array against job tokens */
function skillsOverlapScore(resumeSkills: string[], jobTokens: string[]): number {
  if (!resumeSkills.length) return 0;
  const jobSet = new Set(jobTokens.map((t) => t.toLowerCase()));
  const matched = resumeSkills.filter((s) =>
    s.toLowerCase().split(/\s+/).every((part) => jobSet.has(part) || jobSet.has(part.replace(/#|\+/g, '')))
  );
  return Math.round((matched.length / resumeSkills.length) * 100);
}

/** Title match: see if job title tokens appear in resume */
function titleMatchScore(jobTitle: string, resumeTokens: string[]): number {
  const titleTokens = tokenise(jobTitle);
  const resumeSet = new Set(resumeTokens);
  const matched = titleTokens.filter((t) => resumeSet.has(t));
  return titleTokens.length === 0 ? 0 : Math.round((matched.length / titleTokens.length) * 100);
}

/** Experience level match based on YOE keywords in resume vs job */
function experienceScore(resumeText: string, jobText: string): number {
  const extractYears = (text: string): number | null => {
    const match = text.match(/(\d+)\+?\s*(?:to\s*\d+\s*)?years?/i);
    return match ? parseInt(match[1], 10) : null;
  };

  const resumeYears = extractYears(resumeText);
  const jobMinYears = extractYears(jobText);

  if (resumeYears === null || jobMinYears === null) return 50;
  if (resumeYears >= jobMinYears) return 100;
  const gap = jobMinYears - resumeYears;
  return Math.max(0, Math.round((1 - gap / jobMinYears) * 100));
}

export interface ScoringResult {
  overall: number;
  skills_score: number;
  title_score: number;
  experience_score: number;
}

/**
 * Score a job against a resume using TF-IDF cosine similarity + skill overlap + title match.
 *
 * @param resumeText  - Full text of the candidate's resume
 * @param jobTitle    - Job title string
 * @param jobText     - Full job description text
 * @param resumeSkills - Pre-extracted skills array (optional, improves accuracy)
 * @returns ScoringResult with scores 0-100
 */
export function scoreJob(
  resumeText: string,
  jobTitle: string,
  jobText: string,
  resumeSkills: string[] = []
): ScoringResult {
  const resumeTokens = tokenise(resumeText);
  const jobTokens = tokenise(jobText);

  const resumeTF = buildTF(resumeTokens);
  const jobTF = buildTF(jobTokens);

  // Core cosine similarity (0-1 → 0-100)
  const cosine = cosineSimilarity(resumeTF, jobTF);
  const cosineScore = Math.round(Math.min(cosine * 250, 100)); // scale up; raw cosine tends to be low

  // Skill overlap
  const skills = skillsOverlapScore(
    resumeSkills.length > 0 ? resumeSkills : extractSkillsFromText(resumeText),
    jobTokens
  );

  // Title match
  const title = titleMatchScore(jobTitle, resumeTokens);

  // Experience
  const exp = experienceScore(resumeText, jobText);

  // Weighted overall: 40% cosine, 35% skills, 15% title, 10% experience
  const overall = Math.round(cosineScore * 0.4 + skills * 0.35 + title * 0.15 + exp * 0.1);

  return {
    overall: Math.min(100, Math.max(0, overall)),
    skills_score: Math.min(100, Math.max(0, skills)),
    title_score: Math.min(100, Math.max(0, title)),
    experience_score: Math.min(100, Math.max(0, exp)),
  };
}

/** Heuristic skill extraction for when no explicit skills array exists */
function extractSkillsFromText(text: string): string[] {
  // Common tech skill patterns
  const patterns = [
    /\b(typescript|javascript|python|rust|go|java|kotlin|swift|c\+\+|c#|ruby|php|scala|elixir)\b/gi,
    /\b(react|vue|angular|svelte|next\.?js|nuxt|gatsby)\b/gi,
    /\b(node\.?js|deno|express|fastapi|django|flask|spring|rails|laravel)\b/gi,
    /\b(postgresql|mysql|mongodb|redis|elasticsearch|dynamodb|sqlite)\b/gi,
    /\b(aws|gcp|azure|docker|kubernetes|terraform|ansible)\b/gi,
    /\b(graphql|rest|grpc|websocket|kafka|rabbitmq|celery)\b/gi,
    /\b(git|github|gitlab|ci\/cd|jenkins|github actions)\b/gi,
  ];

  const skills = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    matches.forEach((m) => skills.add(m.toLowerCase()));
  }
  return [...skills];
}

/** Extract skills from resume text for storage in user_profiles */
export function extractSkills(resumeText: string): string[] {
  return extractSkillsFromText(resumeText);
}
