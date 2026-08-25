import React, { useState } from 'react';
import { 
  Database, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  HardDrive, 
  Film, 
  Eye, 
  Layers, 
  Activity, 
  ShieldCheck,
  Key,
  Check,
  Settings
} from 'lucide-react';
import { DatabaseStats, VideoRecord } from '../types';

interface DatabaseStatusCardProps {
  stats: DatabaseStats | null;
  videos: VideoRecord[];
  onRefresh: () => void;
}

export const DatabaseStatusCard: React.FC<DatabaseStatusCardProps> = ({
  stats,
  videos,
  onRefresh,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Custom Config Form
  const [dbHost, setDbHost] = useState(stats?.host || 'psql.fr-roub1.bengt.wasmernet.com');
  const [dbPort, setDbPort] = useState(stats?.port ? String(stats.port) : '20184');
  const [dbName, setDbName] = useState(stats?.database || 'video');
  const [dbUser, setDbUser] = useState(stats?.user || 'user_9f0a1bbd');
  const [dbPass, setDbPass] = useState('pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZ0');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigMessage(null);
    const token = localStorage.getItem('animem_cdn_token') || '';

    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          host: dbHost,
          port: parseInt(dbPort, 10),
          database: dbName,
          user: dbUser,
          password: dbPass,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfigMessage({
          type: 'success',
          text: data.message || 'PostgreSQL sozlamalari yangilandi va muvaffaqiyatli ulandi!',
        });
        await onRefresh();
        setTimeout(() => setShowConfigModal(false), 1500);
      } else {
        setConfigMessage({
          type: 'error',
          text: data.error || 'Ulanishda xatolik yuz berdi. Parol yoki hostni tekshiring.',
        });
      }
    } catch (err: any) {
      setConfigMessage({
        type: 'error',
        text: 'So\'rov yuborishda xatolik: ' + err.message,
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) {
      return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner with Server Details */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
        
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-white">PostgreSQL Ma'lumotlar Bazasi Holati</h3>
                {stats?.connected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    PostgreSQL Faol (Active)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Lokal Rezerv Rejim (Lokal Xotira Faol)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Barcha video metadatalari va to'liq ikkilik video fayllari (`BYTEA chunks`) to'g'ridan-to'g'ri PostgreSQL bazasida saqlanadi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center">
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 text-blue-400" />
              <span>Baza Sozlamalari</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 active:scale-95 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span>Qayta Tekshirish</span>
            </button>
          </div>

        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-500 block font-mono">PostgreSQL Host & Port</span>
            <span className="text-xs font-bold text-slate-200 font-mono mt-0.5 block truncate">
              {stats?.host || 'psql.fr-roub1.bengt.wasmernet.com'}:{stats?.port || 20184}
            </span>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-500 block font-mono">Database Nomi</span>
            <span className="text-xs font-bold text-blue-400 font-mono mt-0.5 block">
              {stats?.database || 'video'}
            </span>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-500 block font-mono">Foydalanuvchi (User)</span>
            <span className="text-xs font-bold text-slate-200 font-mono mt-0.5 block truncate">
              {stats?.user || 'user_9f0a1bbd'}
            </span>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-500 block font-mono">Ping Latency</span>
            <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              {stats?.latency_ms || 0} ms
            </span>
          </div>

        </div>

      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Jami Videolar</span>
            <Film className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.total_videos ?? videos.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">`videos` jadvalida saqlangan</p>
        </div>

        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">PostgreSQL dagi Hajm</span>
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {formatBytes(stats?.total_size_bytes || 0)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">`video_chunks` (BYTEA) dagi hajm</p>
        </div>

        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Anime Seriyalar</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.anime_count || Array.from(new Set(videos.map(v => v.anime_title))).length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Noyob anime to'plamlari</p>
        </div>

        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Jami Ko'rishlar</span>
            <Eye className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.total_views || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Stream oqimlari soni</p>
        </div>

      </div>

      {/* SQL Table Preview */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-bold text-white font-mono">
              PostgreSQL Tables: `videos` + `video_chunks`
            </h4>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            BYTEA Binary Storage
          </span>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-blue-400 font-bold block">videos (id, title, metadata)</span>
              <span className="text-slate-500 text-[11px]">Metadatalar va token boshqaruvi</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-indigo-300 font-bold block">video_chunks (data BYTEA)</span>
              <span className="text-slate-500 text-[11px]">Videoning o'zi bazada saqlanadi</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-emerald-400 font-bold block">stream_tokens (HMAC SHA-256)</span>
              <span className="text-slate-500 text-[11px]">Xavfsiz vaqtinchalik kalitlar</span>
            </div>
          </div>
        </div>
      </div>

      {/* Database Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">PostgreSQL Ulanish Sozlamalari</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
              {configMessage && (
                <div className={`p-3 rounded-xl text-xs font-medium ${
                  configMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {configMessage.text}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Host</label>
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    required
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Port</label>
                  <input
                    type="text"
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    required
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Database</label>
                  <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    required
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono">User</label>
                  <input
                    type="text"
                    value={dbUser}
                    onChange={(e) => setDbUser(e.target.value)}
                    required
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Parol (Password)</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={dbPass}
                    onChange={(e) => setDbPass(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 pr-9"
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Agar parol Wasmernet panelida yangilangan bo'lsa, yangi parolni shu yerga kiriting.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
                >
                  {isSavingConfig ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Sinab Ko'rish & Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
