'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Briefcase, Eye, EyeOff, Loader2 } from 'lucide-react';

type AuthMode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Show error from auth callback (e.g. expired confirmation link)
  useEffect(() => {
    if (searchParams.get('error') === 'confirmation_failed') {
      setError('Confirmation link expired or invalid. Please sign up again.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          return;
        }

        router.push('/dashboard/jobs');
        router.refresh();
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard/jobs`,
          },
        });

        if (authError) {
          setError(authError.message);
          return;
        }

        setSuccessMessage(
          'Account created! Check your email for a confirmation link.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm animate-fade-in">
      {/* Logo + Branding */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4 shadow-lg shadow-primary-600/30">
          <Briefcase className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Job Search OS</h1>
        <p className="text-sm text-slate-400 mt-1">
          Your remote job command centre
        </p>
      </div>

      {/* Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-6">
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                minLength={mode === 'signup' ? 8 : undefined}
                className="w-full px-3 py-2.5 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 bg-danger-500/10 border border-danger-500/30 rounded-lg text-danger-400 text-sm">
              {error}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="px-3 py-2.5 bg-success-500/10 border border-success-500/30 rounded-lg text-success-400 text-sm">
              {successMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Toggle */}
        <p className="text-center text-sm text-slate-400 mt-5">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button
                onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
                className="text-primary-400 hover:text-primary-300 font-medium transition"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
                className="text-primary-400 hover:text-primary-300 font-medium transition"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
