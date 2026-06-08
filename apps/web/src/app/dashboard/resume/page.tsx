'use client';

import { useState, useEffect } from 'react';
import { FileText, RefreshCw, Plus, X } from 'lucide-react';
import { ResumeUploader } from '@/components/ResumeUploader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import type { UserProfile, JobType } from '@/types';

const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'freelance', label: 'Freelance' },
];

// Helpers to read from JSONB preferences object
const getRoles = (p: UserProfile | null): string[] =>
  Array.isArray((p?.preferences as Record<string,unknown>)?.roles)
    ? ((p!.preferences as Record<string,unknown>).roles as string[])
    : [];

const getLocations = (p: UserProfile | null): string[] =>
  Array.isArray((p?.preferences as Record<string,unknown>)?.locations)
    ? ((p!.preferences as Record<string,unknown>).locations as string[])
    : [];

const getMinSalary = (p: UserProfile | null): number =>
  Number((p?.preferences as Record<string,unknown>)?.salary_min ?? 0);

const getJobTypes = (p: UserProfile | null): string[] =>
  Array.isArray((p?.preferences as Record<string,unknown>)?.job_types)
    ? ((p!.preferences as Record<string,unknown>).job_types as string[])
    : [];

const getSkills = (p: UserProfile | null): string[] =>
  Array.isArray((p?.resume_parsed as Record<string,unknown>)?.skills)
    ? ((p!.resume_parsed as Record<string,unknown>).skills as string[])
    : [];

export default function ResumePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [rescoredCount, setRescoredCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleInput, setRoleInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/resume');
      if (res.ok) { const data = await res.json(); setProfile(data); }
    } catch { setError('Failed to load profile'); }
    finally { setLoading(false); }
  };

  const handleResumeUpload = async (text: string) => {
    const res = await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_text: text }),
    });
    if (!res.ok) throw new Error('Failed to upload resume');
    const updated = await res.json();
    setProfile(updated);
  };

  const handleRescore = async () => {
    setRescoring(true);
    setRescoredCount(null);
    try {
      const res = await fetch('/api/score/batch', { method: 'POST' });
      if (!res.ok) throw new Error('Rescoring failed');
      const data = await res.json();
      setRescoredCount(data.scored);
    } finally { setRescoring(false); }
  };

  const updatePrefsField = (key: string, value: unknown) => {
    setProfile((p) => p ? {
      ...p,
      preferences: { ...(p.preferences as Record<string,unknown>), [key]: value }
    } : p);
  };

  const addTag = (field: 'roles' | 'locations', value: string) => {
    if (!value.trim() || !profile) return;
    const current = field === 'roles' ? getRoles(profile) : getLocations(profile);
    updatePrefsField(field, [...current, value.trim()]);
  };

  const removeTag = (field: 'roles' | 'locations', tag: string) => {
    const current = field === 'roles' ? getRoles(profile) : getLocations(profile);
    updatePrefsField(field, current.filter((t) => t !== tag));
  };

  const toggleJobType = (jt: JobType) => {
    const current = getJobTypes(profile);
    const has = current.includes(jt);
    updatePrefsField('job_types', has ? current.filter((t) => t !== jt) : [...current, jt]);
  };

  const handleSavePreferences = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_roles: getRoles(profile),
          preferred_locations: getLocations(profile),
          min_salary: getMinSalary(profile),
          job_types: getJobTypes(profile),
        }),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
    } finally { setSaving(false); }
  };

  const skills = getSkills(profile);
  const uploadedAt = (profile?.resume_parsed as Record<string,unknown>)?.uploaded_at as string | undefined;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-white">Resume & Preferences</h1>
        <p className="text-xs text-slate-400">Upload your resume to get relevance scores on jobs</p>
      </div>

      {error && <p className="text-sm text-danger-400">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Resume</h2>
        <ResumeUploader onUpload={handleResumeUpload} currentResumeDate={uploadedAt} />

        {profile?.resume_text && (
          <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-400" />
                <span className="text-xs text-slate-300 font-medium">Current resume</span>
              </div>
              <span className="text-xs text-slate-500">{profile.resume_text.length.toLocaleString()} chars</span>
            </div>
            <Button variant="secondary" size="sm" loading={rescoring}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={handleRescore}>
              Re-score all jobs
            </Button>
            {rescoredCount !== null && (
              <p className="text-xs text-success-400 mt-2">Scored {rescoredCount} jobs successfully.</p>
            )}
          </div>
        )}
      </section>

      {skills.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Extracted skills</h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 30).map((s) => <Badge key={s} color="primary">{s}</Badge>)}
          </div>
        </section>
      )}

      {!loading && !profile && (
        <EmptyState icon={<FileText className="w-6 h-6" />} title="No resume uploaded"
          description="Upload your resume to unlock relevance scoring for all jobs." />
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Job Preferences</h2>
        <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Preferred roles</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {getRoles(profile).map((r) => (
                <span key={r} className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-300">
                  {r}
                  <button onClick={() => removeTag('roles', r)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={roleInput} onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addTag('roles', roleInput); setRoleInput(''); } }}
                placeholder="e.g. Senior Engineer"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              <button onClick={() => { addTag('roles', roleInput); setRoleInput(''); }}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Preferred locations</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {getLocations(profile).map((l) => (
                <span key={l} className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-300">
                  {l}
                  <button onClick={() => removeTag('locations', l)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={locationInput} onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { addTag('locations', locationInput); setLocationInput(''); } }}
                placeholder="e.g. Remote, Berlin"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              <button onClick={() => { addTag('locations', locationInput); setLocationInput(''); }}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Minimum salary: ${(getMinSalary(profile) / 1000).toFixed(0)}k
            </label>
            <input type="range" min={0} max={300000} step={5000}
              value={getMinSalary(profile)}
              onChange={(e) => updatePrefsField('salary_min', Number(e.target.value))}
              className="w-full accent-primary-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Job types</label>
            <div className="flex flex-wrap gap-2">
              {JOB_TYPE_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => toggleJobType(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    getJobTypes(profile).includes(value)
                      ? 'bg-primary-600/20 text-primary-300 border border-primary-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}>{label}</button>
              ))}
            </div>
          </div>

          <Button variant="primary" size="sm" loading={saving} onClick={handleSavePreferences}>
            Save preferences
          </Button>
        </div>
      </section>
    </div>
  );
}
