import React, { useState, useEffect } from 'react';
import { LockScreen } from './components/LockScreen';
import { Navbar } from './components/Navbar';
import { VideoGrid } from './components/VideoGrid';
import { VideoUploadModal } from './components/VideoUploadModal';
import { AnimemPlayer } from './components/AnimemPlayer';
import { EmbedCodeModal } from './components/EmbedCodeModal';
import { DatabaseStatusCard } from './components/DatabaseStatusCard';
import { DomainProtectionSettings } from './components/DomainProtectionSettings';
import { ApiDocsModal } from './components/ApiDocsModal';
import { EmbedView } from './components/EmbedView';
import { VideoRecord, DatabaseStats } from './types';
import { X, Sparkles } from 'lucide-react';

export default function App() {
  // Check for standalone Embed Route (/embed/:id)
  const pathname = window.location.pathname;
  if (pathname.startsWith('/embed/')) {
    const embedId = pathname.replace('/embed/', '').split('/')[0];
    if (embedId) {
      return <EmbedView videoId={embedId} />;
    }
  }

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'videos' | 'database' | 'security' | 'api'>('videos');
  
  // Videos & DB State
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);

  // Modals State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedVideoForPlay, setSelectedVideoForPlay] = useState<VideoRecord | null>(null);
  const [selectedVideoForEmbed, setSelectedVideoForEmbed] = useState<VideoRecord | null>(null);

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('animem_cdn_token');
    if (!token) {
      setIsAuthenticated(false);
      setIsAuthChecking(false);
      return;
    }

    fetch('/api/auth/check', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated === true);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  // Fetch Videos & Database status when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchVideos();
      fetchDatabaseStats();
    }
  }, [isAuthenticated]);

  const fetchVideos = async () => {
    setIsLoadingVideos(true);
    try {
      const res = await fetch('/api/videos');
      const data = await res.json();
      if (data.videos) {
        setVideos(data.videos);
      }
    } catch (e) {
      console.error('Videolarni yuklashda xatolik:', e);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const fetchDatabaseStats = async () => {
    try {
      const res = await fetch('/api/database/status');
      const data = await res.json();
      setDbStats(data);
    } catch (e) {
      console.error('DB holatini olishda xatolik:', e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('animem_cdn_token');
    setIsAuthenticated(false);
  };

  const handleDeleteVideo = async (id: string) => {
    const token = localStorage.getItem('animem_cdn_token') || '';
    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v.id !== id));
        fetchDatabaseStats();
      }
    } catch (e) {
      alert('O\'chirishda xatolik');
    }
  };

  const handleUploadSuccess = (newVideo: any) => {
    fetchVideos();
    fetchDatabaseStats();
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
          <span className="text-xs font-mono">ANIMEM.UZ CDN yuklanmoqda...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LockScreen onUnlock={() => setIsAuthenticated(true)} />;
  }

  const existingAnimeTitles = Array.from(new Set(videos.map((v) => v.anime_title))).filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadOpen(true)}
        onLogout={handleLogout}
        dbStats={dbStats}
        videoCount={videos.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'videos' && (
          <VideoGrid
            videos={videos}
            onPlayVideo={(video) => setSelectedVideoForPlay(video)}
            onOpenEmbed={(video) => setSelectedVideoForEmbed(video)}
            onDeleteVideo={handleDeleteVideo}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        )}

        {activeTab === 'database' && (
          <DatabaseStatusCard
            stats={dbStats}
            videos={videos}
            onRefresh={fetchDatabaseStats}
          />
        )}

        {activeTab === 'security' && <DomainProtectionSettings />}

        {activeTab === 'api' && <ApiDocsModal />}
      </main>

      {/* Video Upload Modal */}
      <VideoUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
        existingAnimeTitles={existingAnimeTitles}
      />

      {/* Video Player Fullscreen Overlay */}
      {selectedVideoForPlay && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <AnimemPlayer 
            video={selectedVideoForPlay} 
            autoplay={true} 
            onClose={() => setSelectedVideoForPlay(null)} 
          />
        </div>
      )}

      {/* Embed Code Modal */}
      <EmbedCodeModal
        video={selectedVideoForEmbed}
        isOpen={!!selectedVideoForEmbed}
        onClose={() => setSelectedVideoForEmbed(null)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">ANIMEM.UZ</span>
            <span>•</span>
            <span>Ultra-Fast Video CDN Server & PostgreSQL Integration</span>
          </div>
          <div className="font-mono text-[11px] text-slate-600">
            PostgreSQL: psql.fr-roub1.bengt.wasmernet.com:20184 (video)
          </div>
        </div>
      </footer>

    </div>
  );
}
