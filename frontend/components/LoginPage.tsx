import React, { useState } from 'react';

interface Props {
  onLogin: (token: string) => void;
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / App name */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#AF52DE] rounded-2xl mb-4 shadow-lg shadow-[#AF52DE]/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-slate-900">WealthCompass</h1>
          <p className="text-sm text-slate-500 mt-1">Your personal portfolio tracker</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border shadow-sm p-8">
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#AF52DE] focus:border-transparent"
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
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#AF52DE] focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#AF52DE] text-white text-sm font-bold rounded-xl hover:bg-[#9440C2] transition-colors disabled:opacity-60"
            >
              {loading ? 'Please wait…' : isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            {isRegistering ? (
              <p className="text-xs text-slate-500">
                Already have an account?{' '}
                <button onClick={() => { setIsRegistering(false); setError(''); }} className="text-[#AF52DE] font-bold hover:underline">Sign in</button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                First time here?{' '}
                <button onClick={() => { setIsRegistering(true); setError(''); }} className="text-[#AF52DE] font-bold hover:underline">Create account</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
