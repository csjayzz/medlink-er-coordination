import React, { useState } from 'react';
import { Shield, Building2, Mail, Lock, AlertCircle } from 'lucide-react';

type LoginRole = 'MEDIC' | 'HOSPITAL';

interface LoginPageProps {
  onLogin: (role: 'MEDIC' | 'HOSPITAL', medic?: { id: string; name: string; unit?: string; certification?: string }) => void;
}

const DEMO_MEDICS: Record<string, { id: string; name: string; unit: string; certification: string }> = {
  'medic1@medlink.demo': { id: 'MED-9921', name: 'Sarah Jenkins', unit: 'Medic 42 / Rescue 1', certification: 'Paramedic (FP-C)' },
  'medic2@medlink.demo': { id: 'MED-8842', name: 'Alex Rivera', unit: 'Medic 12', certification: 'EMT-P' },
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<LoginRole>('MEDIC');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setError('Please enter your email or username.');
      return;
    }
    if (!trimmedPassword) {
      setError('Please enter your password.');
      return;
    }

    if (role === 'MEDIC') {
      const demo = DEMO_MEDICS[trimmedEmail];
      if (demo) {
        onLogin('MEDIC', demo);
      } else {
        const name = trimmedEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Field Medic';
        onLogin('MEDIC', {
          id: `MED-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          name,
          unit: 'Field Unit',
          certification: 'Paramedic',
        });
      }
    } else {
      onLogin('HOSPITAL');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
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
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
                    role === 'MEDIC'
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
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all ${
                    role === 'HOSPITAL'
                      ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Hospital Staff
                </button>
              </div>
            </div>

            {/* Email / Username */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Email or username
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="email"
                  type="text"
                  autoComplete="username email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={role === 'MEDIC' ? 'e.g. medic1@medlink.demo' : 'e.g. admin@hospital.demo'}
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-blue-600/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all active:scale-[0.99]"
            >
              Log in
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-slate-500 hover:text-blue-600 text-sm font-medium transition-colors"
            >
              Forgot password?
            </button>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Demo: use any email/password. Medic demo accounts: medic1@medlink.demo, medic2@medlink.demo
        </p>
      </div>
    </div>
  );
}
