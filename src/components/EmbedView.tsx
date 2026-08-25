import React, { useState, useEffect } from 'react';
import { ShieldAlert, Film, RefreshCw, AlertCircle, Play } from 'lucide-react';
import { VideoRecord } from '../types';
import { AnimemPlayer } from './AnimemPlayer';

interface EmbedViewProps {
  videoId: string;
}

export const EmbedView: React.FC<EmbedViewProps> = ({ videoId }) => {
  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [hlsUrl, setHlsUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    fetchVideoData();
  }, [videoId]);

  const fetchVideoData = async () => {
    setIsLoading(true);
    setError(null);
    setIsBlocked(false);

    try {
      const res = await fetch(`/api/videos/${videoId}`);
      const data = await res.json();

      if (res.status === 403) {
        setIsBlocked(true);
        setError(data.message || 'Ushbu video faqat Animem.uz saytida ko\'rish uchun himoyalangan!');
        setIsLoading(false);
        return;
      }

      if (res.ok && data.video) {
        setVideo(data.video);
        setStreamUrl(data.stream_url || `/api/stream/${videoId}?token=${data.token}`);
        setHlsUrl(data.hls_url || `/api/hls/${videoId}/index.m3u8?token=${data.token}`);
      } else {
        setError(data.error || 'Video topilmadi.');
      }
    } catch (err) {
      setError('Video yuklashda xatolik yuz berdi.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
          <span className="text-xs font-mono text-slate-400">ANIMEM.UZ Video Yuklanmoqda...</span>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6 text-center text-slate-200">
        <div className="max-w-md bg-slate-900 border border-rose-900/50 p-6 rounded-2xl shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">HOTLINK HIMOYASI</h2>
          <p className="text-xs text-rose-300 leading-relaxed mb-4">
            {error || 'Ushbu video faqat Animem.uz domenida ishlash uchun sozlangan. Boshqa saytlardan kirish taqiqlangan.'}
          </p>
          <a
            href="https://animem.uz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all"
          >
            <span>Animem.uz Saytiga O'tish</span>
          </a>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-4 text-center text-slate-400 text-xs">
        <div className="flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <p>{error || 'Video topilmadi yoki o\'chirilgan.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden">
      <AnimemPlayer video={video} streamUrl={streamUrl} hlsUrl={hlsUrl} autoplay={true} />
    </div>
  );
};
