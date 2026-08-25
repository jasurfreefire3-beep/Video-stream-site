import React, { useState } from 'react';
import { Lock, ShieldCheck, Play, KeyRound, AlertCircle } from 'lucide-react';

interface LockScreenProps {
  onUnlock: (token: string) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Iltimos, parolni kiriting!');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('animem_cdn_token', data.token);
        onUnlock(data.token);
      } else {
        setError(data.error || 'Parol noto\'g\'ri! Qayta urinib ko\'ring.');
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
    } catch (err) {
      setError('Server bilan bog\'lanishda xatolik yuz berdi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Anime Ambient Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className={`w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-8 shadow-2xl relative z-10 transition-transform ${shake ? 'animate-bounce' : ''}`}>
        
        {/* Brand Icon & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 to-indigo-600 p-0.5 shadow-lg shadow-rose-950/50 mb-4">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Play className="w-8 h-8 text-rose-500 fill-rose-500 ml-0.5" />
            </div>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>ANIMEM.UZ</span>
            <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30">
              CDN HOST
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Tezkor video yuklash va MySQL oqim serveri
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
              <span>Xavfsizlik Paroli</span>
              <span className="text-slate-500 text-[11px] font-normal">Faqat admin uchun</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                id="admin-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Parolni kiriting..."
                autoFocus
                className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all font-mono tracking-widest text-base"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-[0.99] text-white font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Boshqaruv Paneliga Kirish</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Security Badges */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Domen himoyasi faol (animem.uz)</span>
          </div>
          <span className="text-slate-500 font-mono text-[11px]">SSL Secure • 256-bit</span>
        </div>

      </div>
    </div>
  );
};
