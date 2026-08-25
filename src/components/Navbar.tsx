import React from 'react';
import { 
  Play, 
  Upload, 
  Database, 
  ShieldCheck, 
  Code2, 
  Film, 
  LogOut, 
  HardDrive,
  Activity
} from 'lucide-react';
import { DatabaseStats } from '../types';

interface NavbarProps {
  activeTab: 'videos' | 'database' | 'security' | 'api';
  setActiveTab: (tab: 'videos' | 'database' | 'security' | 'api') => void;
  onOpenUpload: () => void;
  onLogout: () => void;
  dbStats: DatabaseStats | null;
  videoCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenUpload,
  onLogout,
  dbStats,
  videoCount,
}) => {
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) {
      return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-indigo-600 p-0.5 shadow-md shadow-rose-950/40 shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Play className="w-5 h-5 text-rose-500 fill-rose-500 ml-0.5" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">ANIMEM.UZ</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded">
                  CDN V2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                Ultra-Fast Anime Video Streaming & PostgreSQL Host
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-tab-videos"
              onClick={() => setActiveTab('videos')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'videos'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Videolar ({videoCount})</span>
            </button>

            <button
              id="nav-tab-database"
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'database'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>PostgreSQL Baza</span>
              {dbStats?.connected ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>

            <button
              id="nav-tab-security"
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'security'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Domen Himoyasi</span>
            </button>

            <button
              id="nav-tab-api"
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'api'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>API Hujjatlar</span>
            </button>
          </nav>

          {/* Action Buttons & Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Stats Pill */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 text-slate-300">
                <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-mono text-slate-200">{formatBytes(dbStats?.total_size_bytes || 0)}</span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-mono">{dbStats?.latency_ms || 0}ms</span>
              </div>
            </div>

            {/* Upload Button */}
            <button
              id="btn-open-upload-modal"
              onClick={onOpenUpload}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/25 active:scale-95 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Video Yuklash</span>
              <span className="sm:hidden">Yuklash</span>
            </button>

            {/* Logout */}
            <button
              id="btn-logout"
              onClick={onLogout}
              title="Chiqish"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-xl border border-transparent hover:border-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/60">
          <button
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${
              activeTab === 'videos' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Videolar</span>
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${
              activeTab === 'database' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>MySQL</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${
              activeTab === 'security' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Himoya</span>
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${
              activeTab === 'api' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>API</span>
          </button>
        </div>

      </div>
    </header>
  );
};
