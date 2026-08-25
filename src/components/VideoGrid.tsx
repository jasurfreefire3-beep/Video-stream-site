import React, { useState } from 'react';
import { 
  Play, 
  Film, 
  Code, 
  Trash2, 
  Search, 
  Filter, 
  Clock, 
  Eye, 
  HardDrive, 
  Sparkles,
  LayoutGrid,
  List,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  Link2
} from 'lucide-react';
import { VideoRecord } from '../types';

interface VideoGridProps {
  videos: VideoRecord[];
  onPlayVideo: (video: VideoRecord) => void;
  onOpenEmbed: (video: VideoRecord) => void;
  onDeleteVideo: (id: string) => void;
  onOpenUpload: () => void;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  videos,
  onPlayVideo,
  onOpenEmbed,
  onDeleteVideo,
  onOpenUpload,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('all');
  const [selectedAnime, setSelectedAnime] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  // Get unique anime list
  const uniqueAnimes = Array.from(new Set(videos.map((v) => v.anime_title))).filter(Boolean);

  // Filter videos
  const filteredVideos = videos.filter((v) => {
    const matchesSearch =
      v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.anime_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.episode_number.toString().includes(searchTerm);

    const matchesQuality = selectedQuality === 'all' || v.quality === selectedQuality;
    const matchesAnime = selectedAnime === 'all' || v.anime_title === selectedAnime;

    return matchesSearch && matchesQuality && matchesAnime;
  });

  const handleQuickCopyHls = (video: VideoRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const hlsUrl = `${window.location.origin}/api/hls/${video.id}/index.m3u8`;
    navigator.clipboard.writeText(hlsUrl);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Search & Filter Bar */}
      <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Anime nomi yoki qism bo'yicha qidirish..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>

        {/* Dropdown Filters & View Mode */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap justify-between">
          
          {/* Anime Filter */}
          <select
            value={selectedAnime}
            onChange={(e) => setSelectedAnime(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
          >
            <option value="all">Barcha Animelar ({uniqueAnimes.length})</option>
            {uniqueAnimes.map((anime) => (
              <option key={anime} value={anime}>
                {anime}
              </option>
            ))}
          </select>

          {/* Quality Filter */}
          <select
            value={selectedQuality}
            onChange={(e) => setSelectedQuality(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-200 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
          >
            <option value="all">Barcha Sifatlar</option>
            <option value="1080p">1080p Full HD</option>
            <option value="720p">720p HD</option>
            <option value="480p">480p SD</option>
            <option value="4K">4K Ultra HD</option>
          </select>

          {/* Grid / Table Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Katakcha ko'rinishi"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'table' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Jadval ko'rinishi"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* Videos List / Grid */}
      {filteredVideos.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <Film className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            {searchTerm || selectedAnime !== 'all' ? 'Hech qanday video topilmadi' : 'Hozircha hech qanday video yuklanmagan'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            {searchTerm
              ? 'Qidiruv parametrlarini o\'zgartiring yoki filtrni tozalang.'
              : 'Animem.uz uchun birinchi anime video qismini yuklang va tezkor oqim linkini oling.'}
          </p>
          <button
            onClick={onOpenUpload}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Birinchi Videoni Yuklash</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              className="bg-slate-900/90 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl overflow-hidden shadow-xl transition-all group flex flex-col"
            >
              {/* Thumbnail Container */}
              <div
                onClick={() => onPlayVideo(video)}
                className="relative aspect-video bg-slate-950 cursor-pointer overflow-hidden flex items-center justify-center"
              >
                {video.poster_url ? (
                  <img
                    src={video.poster_url}
                    alt={video.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-slate-600 group-hover:text-rose-400 transition-colors">
                    <Film className="w-10 h-10" />
                    <span className="text-[10px] font-mono">ANIMEM.UZ</span>
                  </div>
                )}

                {/* Hover Play Button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Quality Badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded text-[10px] font-mono font-bold text-white border border-white/10">
                  {video.quality}
                </span>

                {/* MP4 Fast Stream Badge */}
                <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-emerald-600/90 backdrop-blur-md rounded text-[9px] font-mono font-bold text-white flex items-center gap-0.5">
                  ⚡ DIRECT MP4
                </span>

                {/* Episode Badge */}
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-rose-600/90 backdrop-blur-md rounded text-[10px] font-mono font-bold text-white">
                  EP {video.episode_number}
                </span>

                {/* Size Badge */}
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-md rounded text-[10px] font-mono text-slate-300">
                  {formatBytes(video.file_size)}
                </span>
              </div>

              {/* Video Info */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-rose-400 transition-colors line-clamp-1">
                    {video.anime_title}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                    {video.title}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2 font-mono">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-400" />
                      {video.views_count || 0}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      animem.uz
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onPlayVideo(video)}
                      title="Pleerda ko'rish"
                      className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <button
                      onClick={() => onOpenEmbed(video)}
                      title="Oqim Linklarini Olish (HLS / MP4)"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-colors flex items-center gap-1"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleQuickCopyHls(video, e)}
                      title="Tezkor HLS (.m3u8) nusxalash"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                    >
                      {copiedId === video.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(`Rostdan ham "${video.title}" videosini o'chirmoqchimisiz?`)) {
                        onDeleteVideo(video.id);
                      }
                    }}
                    title="O'chirish"
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>

            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Anime / Qism</th>
                  <th className="px-4 py-3">Sifat</th>
                  <th className="px-4 py-3">Hajmi</th>
                  <th className="px-4 py-3">Ko'rishlar</th>
                  <th className="px-4 py-3">Himoya</th>
                  <th className="px-4 py-3">Sana</th>
                  <th className="px-4 py-3 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredVideos.map((video) => (
                  <tr key={video.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">
                      <div className="flex items-center gap-2.5">
                        <div
                          onClick={() => onPlayVideo(video)}
                          className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-rose-400 cursor-pointer hover:bg-rose-600 hover:text-white transition-colors shrink-0"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </div>
                        <div>
                          <div className="text-white font-bold">{video.anime_title}</div>
                          <div className="text-[11px] text-slate-400">{video.title} (Ep {video.episode_number})</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-200 border border-slate-700">
                        {video.quality}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {formatBytes(video.file_size)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {video.views_count || 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        animem.uz
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[11px] font-mono">
                      {formatDate(video.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenEmbed(video)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Link2 className="w-3 h-3 text-rose-400" />
                          <span>Linklar</span>
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Rostdan ham "${video.title}" videosini o'chirmoqchimisiz?`)) {
                              onDeleteVideo(video.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
