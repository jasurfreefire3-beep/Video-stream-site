import React, { useState, useRef, useEffect, useMemo } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw, 
  RotateCw, 
  Settings, 
  Tv, 
  ShieldCheck,
  Film,
  Zap,
  Sparkles
} from 'lucide-react';
import { VideoRecord } from '../types';

interface AnimemPlayerProps {
  video: VideoRecord;
  streamUrl?: string;
  hlsUrl?: string;
  autoplay?: boolean;
  onClose?: () => void;
}

export const AnimemPlayer: React.FC<AnimemPlayerProps> = ({
  video,
  streamUrl,
  hlsUrl,
  autoplay = false,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHlsActive, setIsHlsActive] = useState(false);

  const [isGeneratingSubtitle, setIsGeneratingSubtitle] = useState(false);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleStatus, setSubtitleStatus] = useState<string | null>(null);

  const handleGenerateSubtitles = async () => {
    const token = localStorage.getItem('animem_cdn_token') || '';
    setIsGeneratingSubtitle(true);
    setSubtitleStatus('AI orqali o\'zbekcha subtitr yaratilmoqda (barcha tillardan tarjima qilinmoqda)...');
    try {
      const res = await fetch(`/api/videos/${video.id}/generate-subtitles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubtitleUrl(data.subtitle_url);
        setSubtitleEnabled(true);
        setSubtitleStatus('O\'zbekcha subtitr muvaffaqiyatli yoqildi!');
        if (videoRef.current) {
          const tracks = videoRef.current.textTracks;
          for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].language === 'uz') {
              tracks[i].mode = 'showing';
            }
          }
        }
      } else {
        setSubtitleStatus(data.error || 'Subtitr generatsiya qilishda xatolik');
      }
    } catch (e: any) {
      setSubtitleStatus('Xatolik: ' + e.message);
    } finally {
      setIsGeneratingSubtitle(false);
      setTimeout(() => setSubtitleStatus(null), 5000);
    }
  };

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const safePlay = (element: HTMLMediaElement | null) => {
    if (!element) return;
    try {
      const promise = element.play();
      if (promise !== undefined) {
        promise.catch((err: any) => {
          // Benign error when play is interrupted by pause() or unmount
          if (err.name !== 'AbortError' && !err.message?.includes('interrupted')) {
            console.debug('[AnimemPlayer] Play error handled:', err.message);
          }
        });
      }
    } catch (e) {
      // ignore
    }
  };

  const targetHlsUrl = useMemo(() => {
    let url = hlsUrl || video.hls_url || `/api/hls/${video.id}/index.m3u8`;
    if (!url.includes('preview=') && !url.includes('token=')) {
      url += (url.includes('?') ? '&' : '?') + 'preview=1';
    }
    return url;
  }, [hlsUrl, video.hls_url, video.id]);

  const fallbackStreamUrl = useMemo(() => {
    let url = streamUrl || video.stream_url || `/api/stream/${video.id}`;
    // If it's an absolute URL pointing to same app/localhost, convert to clean relative path to avoid HTTPS mixed-content blocks
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const parsed = new URL(url);
        url = parsed.pathname + parsed.search;
      } catch (e) {}
    }
    if (!url.includes('preview=') && !url.includes('token=')) {
      url += (url.includes('?') ? '&' : '?') + 'preview=1';
    }
    return url;
  }, [streamUrl, video.stream_url, video.id]);

  // Initialize Ultra-Fast Direct MP4 Streaming (Direct Cloudflare-grade byte range streaming)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    setIsLoading(true);
    setIsHlsActive(false);

    // Direct MP4 206 Partial Content Stream - Instant load & smooth seeking
    videoElement.src = fallbackStreamUrl;
    videoElement.preload = 'auto';
    videoElement.load();

    const handleCanPlay = () => {
      setIsLoading(false);
      if (autoplay) {
        safePlay(videoElement);
      }
    };

    const handleLoadedData = () => {
      setIsLoading(false);
    };

    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('loadeddata', handleLoadedData);

    return () => {
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [video.id, fallbackStreamUrl, autoplay]);

  // Restore saved playback position
  useEffect(() => {
    const savedTime = localStorage.getItem(`animem_pos_${video.id}`);
    if (savedTime && videoRef.current) {
      const time = parseFloat(savedTime);
      if (!isNaN(time) && time > 5) {
        videoRef.current.currentTime = time;
      }
    }
  }, [video.id]);

  // Save playback position periodically
  useEffect(() => {
    if (currentTime > 5 && duration > 0) {
      localStorage.setItem(`animem_pos_${video.id}`, currentTime.toString());
    }
  }, [currentTime, video.id, duration]);

  // Handle controls hide timer
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
      }
    }, 3000);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      safePlay(video);
    } else {
      video.pause();
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);

    // Calculate buffered percentage
    if (videoRef.current.buffered.length > 0) {
      for (let i = 0; i < videoRef.current.buffered.length; i++) {
        if (
          videoRef.current.buffered.start(i) <= videoRef.current.currentTime &&
          videoRef.current.currentTime <= videoRef.current.buffered.end(i)
        ) {
          setBufferedEnd(videoRef.current.buffered.end(i));
          break;
        }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        skipTime(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        skipTime(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume((v) => {
          const nv = Math.min(1, v + 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => {
          const nv = Math.max(0, v - 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, duration]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative w-full h-full bg-black rounded-2xl overflow-hidden select-none group flex items-center justify-center shadow-2xl border border-slate-800"
      style={{ minHeight: '360px', aspectRatio: '16/9' }}
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        autoPlay={autoplay}
        playsInline
        preload="auto"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setIsLoading(false);
          }
        }}
        onWaiting={() => setIsLoading(true)}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => {
          setIsLoading(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          const videoEl = videoRef.current;
          const mediaError = videoEl?.error;
          console.warn('[AnimemPlayer] Video playback error code:', mediaError?.code, mediaError?.message || '');
          setIsLoading(false);
        }}
        className="w-full h-full object-contain cursor-pointer"
      >
        {subtitleUrl && (
          <track
            kind="subtitles"
            label="O'zbekcha (AI)"
            src={subtitleUrl}
            srcLang="uz"
            default={subtitleEnabled}
          />
        )}
      </video>

      {/* Subtitle Status Toast Overlay */}
      {subtitleStatus && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-rose-500/50 text-rose-300 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-medium">
          {isGeneratingSubtitle && <div className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />}
          <span>{subtitleStatus}</span>
        </div>
      )}

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin shadow-lg shadow-rose-500/20" />
            <span className="text-xs font-mono text-slate-300 font-semibold tracking-wider uppercase">
              ANIMEM.UZ Direct MP4 Oqim Yuklanmoqda...
            </span>
          </div>
        </div>
      )}

      {/* Center Big Play Button (when paused) */}
      {!isPlaying && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-rose-900/60 z-20"
        >
          <Play className="w-9 h-9 fill-white ml-1" />
        </button>
      )}

      {/* Top Header & Watermark Overlay */}
      <div
        className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="px-2.5 py-1 rounded-md bg-rose-600/90 text-white font-black text-xs tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
            <Film className="w-3.5 h-3.5" />
            <span>ANIMEM.UZ</span>
          </div>
          <div className="text-white text-xs font-bold truncate max-w-xs sm:max-w-md">
            {video.anime_title} — {video.episode_number}-qism
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700 text-slate-300 font-mono">
            {video.quality || '1080p'}
          </span>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono font-bold flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
            ⚡ CLOUDFLARE FAST DIRECT MP4
          </span>
        </div>
      </div>

      {/* Persistent subtle watermark in top-right */}
      <div className="absolute top-4 right-4 text-[11px] font-black tracking-wider text-white/30 uppercase pointer-events-none select-none z-10 font-mono">
        ANIMEM.UZ
      </div>

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress / Seekbar */}
        <div className="relative mb-3 group/seek flex items-center">
          <div className="w-full h-1.5 group-hover/seek:h-2.5 bg-slate-800/90 rounded-full overflow-hidden transition-all relative">
            <div
              className="absolute top-0 left-0 h-full bg-slate-600/60 rounded-full transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-rose-600 to-pink-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-2">
          
          {/* Left Controls (Play, Skip, Volume, Time) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={togglePlay}
              className="p-1.5 text-white hover:text-rose-400 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={() => skipTime(-10)}
              className="p-1.5 text-slate-300 hover:text-white transition-colors"
              title="10s orqaga (J)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => skipTime(10)}
              className="p-1.5 text-slate-300 hover:text-white transition-colors"
              title="10s oldinga (L)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-300 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500 hidden group-hover/vol:inline-block transition-all"
              />
            </div>

            {/* Time display */}
            <div className="text-[11px] font-mono text-slate-300">
              <span className="text-white font-bold">{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls (AI Subtitle, Speed, PiP, Fullscreen) */}
          <div className="flex items-center gap-2">
            
            {/* AI Subtitle Button & Download */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleGenerateSubtitles}
                disabled={isGeneratingSubtitle}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  subtitleEnabled 
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/30' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
                title="Istalgan tildagi videoga avtomatik O'zbekcha subtitr yaratish (AI)"
              >
                <Sparkles className={`w-3.5 h-3.5 text-rose-400 ${isGeneratingSubtitle ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isGeneratingSubtitle ? 'Yaratilmoqda...' : subtitleEnabled ? 'UZ Subtitr (Faol)' : 'O\'zbekcha Subtitr (AI)'}
                </span>
                <span className="sm:hidden">UZ Sub</span>
              </button>

              {subtitleUrl && (
                <a
                  href={subtitleUrl}
                  download={`${video.title || video.id}_uzbek.vtt`}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs transition-all flex items-center justify-center"
                  title="O'zbekcha subtitrni yuklab olish (.vtt)"
                >
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                </a>
              )}
            </div>

            {/* Speed Menu Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs font-mono text-slate-200 font-bold transition-all"
              >
                {playbackRate}x
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-2xl z-30 flex flex-col gap-1 min-w-[70px]">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSpeedChange(rate)}
                      className={`px-3 py-1 text-xs font-mono rounded text-left ${
                        playbackRate === rate
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture-in-Picture */}
            <button
              onClick={togglePiP}
              className="p-1.5 text-slate-300 hover:text-white transition-colors hidden sm:inline-block"
              title="Mini Pleyer (PiP)"
            >
              <Tv className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-white hover:text-rose-400 transition-colors"
              title="To'liq Ekran (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
};
