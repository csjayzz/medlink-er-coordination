import React, { useState } from 'react';
import { Shield, Building2, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth, AppRole } from '../context/AuthContext';
import { isFirebaseConfigured } from '../lib/firebase';

export default function LoginPage() {
  const { login, demoLogin, loading } = useAuth();
  const [role, setRole] = useState<AppRole>('MEDIC');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'firebase' | 'demo'>(isFirebaseConfigured ? 'firebase' : 'demo');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }
    if (!trimmedPassword) {
      setError('Please enter your password.');
      return;
    }

    if (mode === 'demo') {
      // Demo mode: no Firebase needed
      const name = trimmedEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Field Medic';
      if (role === 'MEDIC') {
        demoLogin('MEDIC', {
          id: `MED-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          name,
          unit: 'Field Unit',
          certification: 'Paramedic',
        });
      } else {
        demoLogin('HOSPITAL');
      }
      return;
    }

    // Firebase mode
    setIsSubmitting(true);
    try {
      await login(trimmedEmail, trimmedPassword, role);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email format.');
      } else {
        setError(err?.message || 'Login failed. Check your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email above to receive a reset link.');
      return;
    }
    setForgotSent(true);
    setTimeout(() => setForgotSent(false), 5000);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-slate-50 opacity-50"></div>
      </div>
      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-6 sm:px-8 pt-8 pb-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">MedLink ER</h1>
            <p className="text-blue-100 text-sm mt-1">Secure access to your portal</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {/* Role selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Sign in as
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRole('MEDIC')}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${role === 'MEDIC'
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  <Shield className="w-4 h-4" />
                  Ambulance Medic
                </button>
                <button
                  type="button"
                  onClick={() => setRole('HOSPITAL')}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${role === 'HOSPITAL'
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  <Building2 className="w-4 h-4" />
                  Hospital Staff
                </button>
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@medlink.com"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {forgotSent && (
              <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                If an account exists, a reset link has been sent to your email.
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {isSubmitting ? 'Signing in...' : 'Log in'}
            </button>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === 'demo' ? 'firebase' : 'demo')}
                className="text-xs text-slate-400 hover:text-blue-600 font-medium transition-colors"
              >
                {mode === 'demo' ? 'Use Firebase Auth' : 'Use Demo Mode'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          {mode === 'demo'
            ? 'Demo mode: use any email/password to log in without Firebase.'
            : 'Firebase mode: requires a configured Firebase project with Auth enabled.'}
        </p>
        {!isFirebaseConfigured && (
          <p className="text-center text-amber-600 text-xs mt-2">
            Firebase config is missing. Add the `VITE_FIREBASE_*` values before using Firebase Auth.
          </p>
        )}
      </div>
    </div>
  );
}
