import React, { useState } from 'react';
import { X, Copy, Check, Link2, ExternalLink, Play, Sparkles, Shield, Terminal } from 'lucide-react';
import { VideoRecord } from '../types';

interface EmbedCodeModalProps {
  video: VideoRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EmbedCodeModal: React.FC<EmbedCodeModalProps> = ({ video, isOpen, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !video) return null;

  const origin = window.location.origin;
  const hlsUrl = `${origin}/api/hls/${video.id}/index.m3u8`;
  const streamUrl = `${origin}/api/stream/${video.id}`;
  const embedUrl = `${origin}/embed/${video.id}`;
  const apiUrl = `${origin}/api/videos/${video.id}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const links = [
    {
      key: 'hls',
      title: 'HLS Stream (.m3u8) Havolasi',
      badge: 'TAVSIYA ETILADI • ADAPTIVE STREAM',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      description: 'Animem.uz pleyerlari, Hls.js, iOS Safari va har qanday zamonaviy pleyer uchun asosiy oqim linki.',
      url: hlsUrl,
      icon: Play,
      isPrimary: true,
    },
    {
      key: 'direct',
      title: 'Direct MP4 Stream Havolasi',
      badge: '⚡ ULTRA FAST (HTTP 206)',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      description: 'To\'g\'ridan-to\'g\'ri MP4 fayl oqimi. Tezkor yuklab olish yoki standart <video> tegi uchun to\'g\'ridan-to\'g\'ri link.',
      url: streamUrl,
      icon: Sparkles,
      isPrimary: false,
    },
    {
      key: 'embed',
      title: 'Web Pleer Havolasi (Direct URL)',
      badge: 'FULLSCREEN PLAYER',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      description: 'Foydalanuvchilarga to\'g\'ridan-to\'g\'ri to\'liq ekranli Animem.uz pleyerini ochib berish uchun toza havola.',
      url: embedUrl,
      icon: Link2,
      isPrimary: false,
    },
    {
      key: 'api',
      title: 'Video JSON API Endpoint',
      badge: 'REST API',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      description: 'Videoning barcha metama\'lumotlarini (nomi, sifati, oqim linklari) JSON formatida olish manzili.',
      url: apiUrl,
      icon: Terminal,
      isPrimary: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Video Oqim Havolalari (Direct Links)</h3>
              <p className="text-xs text-slate-400">
                {video.anime_title} — {video.episode_number}-qism ({video.quality})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Links List */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {links.map((item) => {
            const Icon = item.icon;
            const isCopied = copiedKey === item.key;

            return (
              <div
                key={item.key}
                className={`p-4 rounded-xl border transition-all ${
                  item.isPrimary
                    ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/30'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${item.isPrimary ? 'text-rose-400' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-white">{item.title}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 mb-2.5">
                  {item.description}
                </p>

                {/* Direct Link Input with Instant Copy Button */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      readOnly
                      value={item.url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono text-rose-300 select-all focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>

                  <button
                    onClick={() => copyToClipboard(item.url, item.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shrink-0 ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : item.isPrimary
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Nusxalandi!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Nusxalash</span>
                      </>
                    )}
                  </button>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Yangi oynada ochish"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}

          {/* Domain Hotlink Protection Info */}
          <div className="flex items-start gap-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Domen himoyasi (Hotlink protection): </span>
              Ushbu oqim havolalari <span className="text-rose-400 font-mono">animem.uz</span> va ruxsat berilgan domenlarda to'liq tezlikda ishlaydi.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
          >
            Yopish
          </button>
        </div>

      </div>
    </div>
  );
};
