import React, { useState, useEffect } from 'react';

interface Props {
  onLogin: (token: string) => void;
}

interface InstanceStatus {
  registered: boolean;
  registration_open: boolean;
  demo: boolean;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [instance, setInstance] = useState<InstanceStatus | null>(null);

  // Unauthenticated. Its only remaining job is the registration policy below —
  // the demo banner and the credential shortcuts it used to drive were removed
  // deliberately, so the login page carries no demo labelling at all.
  // Failure is non-fatal: the form still works.
  useEffect(() => {
    fetch('/api/v1/auth/status')
      .then(res => (res.ok ? res.json() : null))
      .then(setInstance)
      .catch(() => setInstance(null));
  }, []);

  // Default true so the toggle doesn't flicker out and back while /auth/status
  // is still in flight on a normal instance.
  const registrationOpen = instance ? instance.registration_open : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Registration failed');
        }
        const data = await res.json();
        onLogin(data.access_token);
      } else {
        const form = new URLSearchParams();
        form.append('username', email);
        form.append('password', password);
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Incorrect email or password');
        }
        const data = await res.json();
        onLogin(data.access_token);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // h-full + its own scroll: the body no longer scrolls, so a viewport too
  // short for the card (phone in landscape) would otherwise clip it.
  return (
    <div className="h-full overflow-y-auto bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / App name */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#0F52BA] rounded mb-4 shadow-lg shadow-[#0F52BA]/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#1D1D1F]">WealthCompass</h1>
          <p className="text-sm text-slate-500 mt-1">Your personal portfolio tracker</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded border shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6">
            {isRegistering ? 'Create your account' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-md border border-slate-200 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F52BA] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-md border border-slate-200 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0F52BA] focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-2 rounded">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0F52BA] text-white text-sm font-bold rounded-md hover:bg-[#0A3E8F] transition-colors disabled:opacity-60"
            >
              {loading ? 'Please wait…' : isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Offering a signup link the server will reject with a 403 is worse
              than offering nothing, so the toggle follows the server's policy. */}
          {registrationOpen && (
            <div className="mt-6 text-center">
              {isRegistering ? (
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <button onClick={() => { setIsRegistering(false); setError(''); }} className="text-[#0F52BA] font-bold hover:underline">Sign in</button>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  First time here?{' '}
                  <button onClick={() => { setIsRegistering(true); setError(''); }} className="text-[#0F52BA] font-bold hover:underline">Create account</button>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
