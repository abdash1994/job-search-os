'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Briefcase, Eye, EyeOff, Loader2 } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgot';

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

  useEffect(() => {
    if (searchParams.get('error') === 'confirmation_failed') {
      setError('Confirmation link expired or invalid. Please sign up again.');
    }
  }, [searchParams]);

  function humanizeAuthError(msg: string): string {
    if (msg.includes('Invalid login credentials')) return 'Email or password is incorrect.';
    if (msg.includes('Email not confirmed')) return 'Please confirm your email first. Check your inbox.';
    if (msg.includes('User already registered')) return 'An account with this email already exists. Try signing in.';
    if (msg.includes('Password should be at least')) return 'Password must be at least 8 characters.';
    if (msg.includes('Unable to validate email address')) return 'Please enter a valid email address.';
    if (msg.includes('Email rate limit exceeded')) return 'Too many attempts. Please wait a few minutes.';
    return msg;
  }

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
          setError(humanizeAuthError(authError.message));
          return;
        }

        router.push('/dashboard/jobs');
        router.refresh();
      } else if (mode === 'signup') {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard/jobs`,
          },
        });

        if (authError) {
          setError(humanizeAuthError(authError.message));
          return;
        }

        setSuccessMessage(
          'Account created! Check your email for a confirmation link.'
        );
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
        });

        if (authError) {
          setError(humanizeAuthError(authError.message));
          return;
        }

        setSuccessMessage('Check your email for a password reset link.');
      }
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength =
    password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password)
      ? 4
      : password.length >= 10
      ? 3
      : password.length >= 8
      ? 2
      : 1;

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
          {mode === 'login'
            ? 'Sign in to your account'
            : mode === 'signup'
            ? 'Create your account'
            : 'Reset your password'}
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

          {/* Password — hidden in forgot mode */}
          {mode !== 'forgot' && (
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

              {/* Password strength bar — signup only */}
              {mode === 'signup' && password.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= passwordStrength
                          ? passwordStrength >= 4
                            ? 'bg-success-500'
                            : passwordStrength >= 3
                            ? 'bg-warning-500'
                            : 'bg-danger-500'
                          : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Forgot password link — login mode only */}
          {mode === 'login' && (
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
                className="text-xs text-slate-500 hover:text-primary-400 transition"
              >
                Forgot password?
              </button>
            </div>
          )}

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
              {mode === 'signup' && (
                <button
                  onClick={async () => {
                    await supabase.auth.resend({ type: 'signup', email });
                    setSuccessMessage('Confirmation email resent. Check your inbox.');
                  }}
                  className="text-xs text-primary-400 hover:text-primary-300 underline mt-1 block"
                >
                  Resend confirmation email
                </button>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {/* Toggle / Back links */}
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
          ) : mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
                className="text-primary-400 hover:text-primary-300 font-medium transition"
              >
                Sign in
              </button>
            </>
          ) : (
            <button
              onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
              className="text-primary-400 hover:text-primary-300 font-medium transition"
            >
              ← Back to sign in
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
