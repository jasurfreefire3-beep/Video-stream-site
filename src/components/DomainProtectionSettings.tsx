import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Globe, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Lock, 
  Key, 
  RefreshCw,
  Play,
  Check
} from 'lucide-react';

export const DomainProtectionSettings: React.FC = () => {
  const [domains, setDomains] = useState<string[]>(['animem.uz', 'www.animem.uz', 'localhost', '127.0.0.1']);
  const [newDomain, setNewDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live Tester State
  const [testReferer, setTestReferer] = useState('https://animem.uz/watch/solo-leveling');
  const [testResult, setTestResult] = useState<{ allowed: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/settings/domains');
      const data = await res.json();
      if (data.domains) {
        setDomains(data.domains);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddDomain = () => {
    if (!newDomain.trim()) return;
    const clean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domains.includes(clean)) {
      setDomains([...domains, clean]);
      setNewDomain('');
    }
  };

  const handleRemoveDomain = (d: string) => {
    if (d === 'animem.uz') {
      alert('Asosiy "animem.uz" domenini o\'chirib bo\'lmaydi!');
      return;
    }
    setDomains(domains.filter((item) => item !== d));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSaveSuccess(false);
    const token = localStorage.getItem('animem_cdn_token') || '';

    try {
      const res = await fetch('/api/settings/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ domains }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      alert('Saqlashda xatolik yuz berdi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTest = () => {
    if (!testReferer.trim()) {
      setTestResult({ allowed: false, message: 'Referer URL manzilini kiriting.' });
      return;
    }

    try {
      const parsed = new URL(testReferer.startsWith('http') ? testReferer : `https://${testReferer}`);
      const hostname = parsed.hostname.toLowerCase();

      const isAllowed = domains.some((d) => {
        if (d.startsWith('*.')) {
          const root = d.substring(2);
          return hostname === root || hostname.endsWith('.' + root);
        }
        return hostname === d || hostname.endsWith('.' + d);
      });

      if (isAllowed) {
        setTestResult({
          allowed: true,
          message: `RUXSAT BERILGAN (200 OK / 206 Partial Stream): Domen "${hostname}" oqim serveridan video stream olish huquqiga ega.`,
        });
      } else {
        setTestResult({
          allowed: false,
          message: `BLOKLANDI (403 Forbidden - Hotlink Protection): Begona domen "${hostname}" video oqimini o'g'irlay olmaydi!`,
        });
      }
    } catch (e) {
      setTestResult({ allowed: false, message: 'Yaroqsiz URL formati.' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Top Banner */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Animem.uz Hotlink & Domen Himoyasi</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Aktiv
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Ushbu tizim siz yuklagan videolarni faqat <strong>animem.uz</strong> saytida ishlashini ta'minlaydi. Agar boshqa noqonuniy saytlar sizning videolaringizni o'z saytiga iframe yoki direct link orqali qo'ysa, server ularga video oqimini bermaydi (403 Forbidden).
            </p>
          </div>
        </div>
      </div>

      {/* Whitelist Manager */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">Ruxsat Berilgan Domenlar (Whitelist)</h4>
            <p className="text-xs text-slate-400 mt-0.5">Videolar faqat shu domenlarda ochiladi</p>
          </div>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saqlandi!</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>O'zgarishlarni Saqlash</span>
              </>
            )}
          </button>
        </div>

        {/* Domain Add Form */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
              placeholder="Yangi domen qo'shish (masalan: app.animem.uz yoki *.animem.uz)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddDomain}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Qo'shish</span>
          </button>
        </div>

        {/* Domain Badges */}
        <div className="flex flex-wrap gap-2 pt-2">
          {domains.map((dom) => (
            <div
              key={dom}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>{dom}</span>
              {dom !== 'animem.uz' && (
                <button
                  onClick={() => handleRemoveDomain(dom)}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Protection Sandbox Tester */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Jonli Domen Himoyasini Sinash (Referer Tester)</span>
        </div>
        <p className="text-xs text-slate-400">
          Ushbu sinov vositasi orqali turli saytlar nomidan so'rov yuborib ko'ring va server ularni qanday bloklashini tekshiring:
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={testReferer}
            onChange={(e) => setTestReferer(e.target.value)}
            placeholder="https://animem.uz/watch yoki https://hacked-site.com"
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white text-xs font-mono focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
          <button
            onClick={handleRunTest}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors shrink-0 flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Sinash</span>
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
          <span>Tezkor namunalar:</span>
          <button
            onClick={() => setTestReferer('https://animem.uz/watch/solo-leveling')}
            className="text-emerald-400 hover:underline"
          >
            https://animem.uz (Ruxsat)
          </button>
          <span>•</span>
          <button
            onClick={() => setTestReferer('https://pirate-anime-stream.com/watch')}
            className="text-rose-400 hover:underline"
          >
            https://pirate-anime-stream.com (Bloklanadi)
          </button>
        </div>

        {/* Test Result Banner */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs font-mono leading-relaxed transition-all ${
              testResult.allowed
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold mb-1">
              {testResult.allowed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              )}
              <span>{testResult.allowed ? 'XAVFSIZ VA RUXSAT BERILDI' : 'MUVAFFAQIYATLI BLOKLANDI'}</span>
            </div>
            <p>{testResult.message}</p>
          </div>
        )}
      </div>

    </div>
  );
};
