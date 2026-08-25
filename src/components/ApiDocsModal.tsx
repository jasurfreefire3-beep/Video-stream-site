import React, { useState } from 'react';
import { Code2, Copy, Check, Terminal, Globe, Zap, Server } from 'lucide-react';

export const ApiDocsModal: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const origin = window.location.origin;

  const endpoints = [
    {
      title: "1. Barcha Animelar Ro'yxatini Olish",
      method: "GET",
      path: "/api/v1/anime-list",
      description: "Animem.uz bosh sahifasi yoki katalogi uchun barcha yuklangan animelar, qismlar soni va posterlarni qaytaradi.",
      exampleResponse: `{
  "success": true,
  "anime_list": [
    {
      "anime_title": "Solo Leveling",
      "total_episodes": 12,
      "latest_upload": "2026-08-25T03:40:00.000Z",
      "poster_url": "https://..."
    }
  ]
}`
    },
    {
      title: "2. Anime Qismlarini va Embed Havolalarini Olish (HLS + Iframe)",
      method: "GET",
      path: "/api/v1/anime/:animeTitle/episodes",
      description: "Tanlangan anime bo'yicha barcha qismlarni (1, 2, 3...), HLS .m3u8 linklarini va tayyor iframe embed linklarini qaytaradi.",
      exampleResponse: `{
  "success": true,
  "anime_title": "Solo Leveling",
  "total_episodes": 1,
  "episodes": [
    {
      "id": "vid_abc123",
      "title": "Solo Leveling - 1-qism",
      "episode_number": 1,
      "quality": "1080p",
      "embed_url": "${origin}/embed/vid_abc123",
      "hls_url": "${origin}/api/hls/vid_abc123/index.m3u8?token=...",
      "stream_url": "${origin}/api/stream/vid_abc123?token=..."
    }
  ]
}`
    },
    {
      title: "3. HLS .m3u8 Oqim Havolasi (Hls.js / Video.js)",
      method: "HLS",
      path: "/api/hls/:videoId/index.m3u8",
      description: "Yuqori tezlikdagi HLS segmentli oqim. Render RAM-ni tejaydi va videoni 4 soniyalik bo'laklarda bir zumda ochib beradi.",
      exampleResponse: `// Hls.js orqali yuklash:
const hls = new Hls();
hls.loadSource('${origin}/api/hls/vid_abc123/index.m3u8?token=...');
hls.attachMedia(videoElement);`
    },
    {
      title: "3. Standart Iframe Orqali Joylash",
      method: "EMBED",
      path: "/embed/:videoId",
      description: "Animem.uz saytidagi istalgan sahifaga video pleerni joylash uchun standart Iframe kodi.",
      exampleResponse: `<iframe 
  src="${origin}/embed/vid_abc123" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  allow="autoplay; fullscreen; picture-in-picture" 
  allowfullscreen>
</iframe>`
    }
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <Code2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Animem.uz Dasturchilari Uchun REST API & Embed Qo'llanmasi</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                v1.0
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Saytingiz backend yoki frontend qismidan ushbu API orqali videolarni avtomatik tarzda yuklab olishingiz va pleerni sahifalarga integratsiya qilishingiz mumkin.
            </p>
          </div>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="space-y-4">
        {endpoints.map((ep, idx) => (
          <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-white">{ep.title}</h4>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${
                  ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {ep.method}
                </span>
                <span className="text-slate-300 bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
                  {ep.path}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400">{ep.description}</p>

            <div className="relative">
              <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto">
                {ep.exampleResponse}
              </pre>
              <button
                onClick={() => handleCopy(ep.exampleResponse, idx)}
                className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                title="Kodni nusxalash"
              >
                {copiedIndex === idx ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
