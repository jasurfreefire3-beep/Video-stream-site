import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  Film, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Copy, 
  Check, 
  Play, 
  Image as ImageIcon,
  Zap,
  ExternalLink
} from 'lucide-react';
import { VideoRecord } from '../types';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (video: VideoRecord) => void;
  existingAnimeTitles: string[];
}

export const VideoUploadModal: React.FC<VideoUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  existingAnimeTitles,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [animeTitle, setAnimeTitle] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('1');
  const [seasonNumber, setSeasonNumber] = useState('1');
  const [quality, setQuality] = useState('1080p');
  const [language, setLanguage] = useState('O\'zbekcha (Tarjima)');
  const [allowedDomain, setAllowedDomain] = useState('animem.uz');
  const [posterUrl, setPosterUrl] = useState('');

  // Upload Progress State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('0 MB/s');
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [chunkStatusText, setChunkStatusText] = useState('');
  const [error, setError] = useState('');
  const [uploadedResult, setUploadedResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef<number>(0);
  const activeXhrsRef = useRef<Set<XMLHttpRequest>>(new Set());
  const isCancelledRef = useRef<boolean>(false);

  if (!isOpen) return null;

  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile) return;
    const lowerName = selectedFile.name.toLowerCase();
    const isVideoExt = /\.(mp4|mkv|webm|avi|mov)$/.test(lowerName);
    if (!selectedFile.type.startsWith('video/') && !isVideoExt) {
      setError('Faqat MP4, MKV, WEBM, AVI yoki MOV formatdagi video fayllarni tanlang.');
      return;
    }

    setFile(selectedFile);
    setError('');

    // Clean title from filename
    const cleanFileName = selectedFile.name.replace(/\.[^/.]+$/, '');
    setTitle(cleanFileName);

    // Try to parse anime name and episode number from filename (e.g. "Naruto_EP01" or "Solo Leveling - 05")
    const epMatch = cleanFileName.match(/(?:ep|episode|qism|q|e)[-_\s]*(\d+)/i) || cleanFileName.match(/[-_\s](\d+)(?:$|\s|\.)/);
    if (epMatch && epMatch[1]) {
      setEpisodeNumber(parseInt(epMatch[1], 10).toString());
    }

    const nameCandidate = cleanFileName
      .replace(/(?:ep|episode|qism|q|e)[-_\s]*\d+/gi, '')
      .replace(/[-_]/g, ' ')
      .trim();

    if (nameCandidate && !animeTitle) {
      setAnimeTitle(nameCandidate);
    }

    // Auto extract thumbnail frame via canvas
    try {
      const url = URL.createObjectURL(selectedFile);
      const tempVideo = document.createElement('video');
      tempVideo.src = url;
      tempVideo.muted = true;
      tempVideo.currentTime = 3; // Capture frame at 3 seconds
      tempVideo.onloadeddata = () => {
        tempVideo.currentTime = Math.min(3, tempVideo.duration / 2);
      };
      tempVideo.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          setPosterUrl(dataUrl);
        }
        URL.revokeObjectURL(url);
      };
    } catch (e) {
      // ignore
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Iltimos, yuklash uchun video fayl tanlang.');
      return;
    }
    if (!animeTitle.trim()) {
      setError('Anime nomini kiriting.');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(file.size);
    setChunkStatusText('Yuklash sessiyasi tayyorlanmoqda...');
    startTimeRef.current = Date.now();
    isCancelledRef.current = false;
    activeXhrsRef.current.clear();

    const token = localStorage.getItem('animem_cdn_token') || '';
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB optimal chunk size (immune to connection drops & 413 limits)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const MAX_CONCURRENCY = 2; // 2 simultaneous parallel upload streams for high speed & stability

    try {
      // 1. Init chunk session
      let initRes: Response;
      try {
        initRes = await fetch('/api/videos/upload-chunk-init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            totalChunks,
          }),
        });
      } catch (fetchErr: any) {
        throw new Error('Server bilan aloqa o\'rnatilmadi. Internetni tekshiring.');
      }

      if (!initRes.ok) {
        let errMsg = `Sessiya ochishda xatolik (${initRes.status})`;
        try {
          const errData = await initRes.json();
          if (errData.error) errMsg = errData.error;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const initData = await initRes.json();
      const uploadId = initData.uploadId;

      // 2. Parallel Multi-stream Chunk Upload Engine
      const chunkLoadedMap: { [index: number]: number } = {};
      let completedChunksCount = 0;

      const updateAggregateProgress = () => {
        let totalLoaded = 0;
        for (let i = 0; i < totalChunks; i++) {
          totalLoaded += chunkLoadedMap[i] || 0;
        }
        const percent = Math.min(98, Math.round((totalLoaded / file.size) * 100));
        setUploadProgress(percent);
        setUploadedBytes(totalLoaded);

        const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
        if (elapsedSec > 0.3) {
          const speedMBs = (totalLoaded / elapsedSec) / (1024 * 1024);
          setUploadSpeed(`${speedMBs.toFixed(1)} MB/s`);
        }
      };

      const uploadSingleChunk = async (chunkIndex: number, retryCount = 0): Promise<void> => {
        if (isCancelledRef.current) {
          return;
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);
        const chunkByteSize = end - start;

        return new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 45000; // 45 seconds timeout
          activeXhrsRef.current.add(xhr);

          // Use both query params and FormData for 100% reliable chunk identification
          const url = `/api/videos/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}`;
          xhr.open('POST', url, true);
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          const chunkFormData = new FormData();
          chunkFormData.append('uploadId', uploadId);
          chunkFormData.append('chunkIndex', chunkIndex.toString());
          chunkFormData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              chunkLoadedMap[chunkIndex] = event.loaded;
              updateAggregateProgress();
            }
          };

          xhr.onload = () => {
            activeXhrsRef.current.delete(xhr);
            if (isCancelledRef.current) return resolve();

            if (xhr.status >= 200 && xhr.status < 300) {
              chunkLoadedMap[chunkIndex] = chunkByteSize;
              completedChunksCount++;
              setChunkStatusText(`Bo'lak ${completedChunksCount}/${totalChunks} yuklandi (${Math.round((completedChunksCount / totalChunks) * 100)}%)`);
              updateAggregateProgress();
              resolve();
            } else {
              if (retryCount < 3) {
                const backoff = (retryCount + 1) * 800;
                setTimeout(() => {
                  uploadSingleChunk(chunkIndex, retryCount + 1).then(resolve).catch(reject);
                }, backoff);
              } else {
                let errMessage = `Bo'lak ${chunkIndex + 1} yuklanmadi (${xhr.status})`;
                try {
                  const errJson = JSON.parse(xhr.responseText);
                  if (errJson.error) errMessage = errJson.error;
                } catch (e) {}
                reject(new Error(errMessage));
              }
            }
          };

          xhr.ontimeout = () => {
            activeXhrsRef.current.delete(xhr);
            if (isCancelledRef.current) return resolve();

            if (retryCount < 3) {
              setTimeout(() => {
                uploadSingleChunk(chunkIndex, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject(new Error(`Bo'lak ${chunkIndex + 1} vaqt tugashi tufayli uzildi. Qaytadan urinib ko'ring.`));
            }
          };

          xhr.onerror = () => {
            activeXhrsRef.current.delete(xhr);
            if (isCancelledRef.current) return resolve();

            if (retryCount < 3) {
              setTimeout(() => {
                uploadSingleChunk(chunkIndex, retryCount + 1).then(resolve).catch(reject);
              }, 1000);
            } else {
              reject(new Error('Internet bilan aloqa uzildi. Qayta urinib ko\'ring.'));
            }
          };

          xhr.send(chunkFormData);
        });
      };

      // Worker queue with concurrent execution
      const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < chunkIndices.length) {
          if (isCancelledRef.current) break;
          const idx = chunkIndices[currentIndex++];
          await uploadSingleChunk(idx);
        }
      };

      // Run parallel workers concurrently
      const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, totalChunks) }, () => worker());
      await Promise.all(workers);

      if (isCancelledRef.current) {
        return;
      }

      // 3. Complete and Merge chunks on server
      setChunkStatusText('Video saqlanmoqda...');
      setUploadProgress(99);

      let completeRes: Response;
      try {
        completeRes = await fetch('/api/videos/upload-chunk-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            uploadId,
            totalChunks,
            fileName: file.name,
            title: title || `${animeTitle} - ${episodeNumber}-qism`,
            anime_title: animeTitle.trim(),
            episode_number: episodeNumber,
            season_number: seasonNumber,
            quality,
            language,
            allowed_domain: allowedDomain,
            poster_url: posterUrl || null,
          }),
        });
      } catch (completeErr: any) {
        throw new Error('Serverda videoni saqlashda tarmoq xatosi yuz berdi.');
      }

      let completeData: any = {};
      try {
        completeData = await completeRes.json();
      } catch (jsonErr) {
        throw new Error(`Server javob berishda xatolik (${completeRes.status})`);
      }

      if (completeRes.ok && completeData.success) {
        setUploadProgress(100);
        setUploadedResult(completeData.video);
        onUploadSuccess(completeData.video);
      } else {
        throw new Error(completeData.error || 'Bo\'laklarni birlashtirishda xatolik yuz berdi.');
      }
    } catch (err: any) {
      if (!isCancelledRef.current) {
        console.error('[Upload Error]', err);
        setError(err.message || 'Yuklashda xatolik yuz berdi.');
      }
    } finally {
      setIsUploading(false);
      activeXhrsRef.current.forEach((x) => {
        try { x.abort(); } catch (e) {}
      });
      activeXhrsRef.current.clear();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const popularAnimeList = [
    'Naruto Shippuden',
    'Attack on Titan',
    'Demon Slayer (Kimetsu no Yaiba)',
    'Solo Leveling',
    'Jujutsu Kaisen',
    'One Piece',
    'Bleach: Thousand-Year Blood War',
    'Death Note',
    'Hunter x Hunter',
    'Chainsaw Man',
    'Black Clover',
    'Vinland Saga'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Yangi Anime Video Yuklash</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  MySQL Stream Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                MP4 videoni yuklang, metadata saqlang va tezkor oqim linkini oling
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Success View */}
        {uploadedResult ? (
          <div className="p-6 space-y-6">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">Video Muvaffaqiyatli Yuklandi!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Fayl diskda va barcha metadata MySQL bazasida <span className="font-mono text-rose-400">`viseo`</span> jadvalida saqlandi.
              </p>
            </div>

            <div className="space-y-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1 block">
                  Animem.uz Iframe Embed Kodi:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`<iframe src="${uploadedResult.embed_url}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400"
                  />
                  <button
                    onClick={() => handleCopy(`<iframe src="${uploadedResult.embed_url}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`)}
                    className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shrink-0"
                    title="Kodni nusxalash"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1 block">
                  To'g'ridan-to'g'ri Tezkor Stream URL:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={uploadedResult.stream_url}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 truncate"
                  />
                  <button
                    onClick={() => handleCopy(uploadedResult.stream_url)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors shrink-0"
                    title="URL nusxalash"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <a
                href={uploadedResult.embed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-xl transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Pleerni Yangi Oynada Sinash</span>
              </a>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => {
                    setUploadedResult(null);
                    setFile(null);
                    setTitle('');
                    setUploadProgress(0);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all"
                >
                  Yana Video Yuklash
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-600/30"
                >
                  Tugatish
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            
            {/* File Dropzone */}
            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-rose-500/80 bg-slate-950/60 hover:bg-slate-950/90 rounded-2xl p-8 text-center cursor-pointer transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/mkv,video/x-matroska,video/webm,video/avi,video/quicktime,.mkv,.mp4,.webm,.avi,.mov"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileChange(e.target.files[0])}
                />
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 group-hover:bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-3 transition-colors">
                  <Film className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  Video faylni bu yerga tashlang yoki tanlang
                </h4>
                <p className="text-xs text-slate-400">
                  MP4, MKV, WebM formatdagi yuqori sifatli anime qismlari (4GB gacha)
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>206 Partial Content Range tezkor oqim qo'llab-quvvatlanadi</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                    <Film className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{file.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Hajmi: {formatSize(file.size)} | Turi: {file.type || 'video/mp4'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setFile(null)}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition-colors shrink-0"
                >
                  Boshqasini tanlash
                </button>
              </div>
            )}

            {/* Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Anime Title */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Anime Nomi <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={animeTitle}
                  onChange={(e) => setAnimeTitle(e.target.value)}
                  placeholder="Masalan: Solo Leveling, Naruto, Bleach..."
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
                {/* Popular Tags */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] text-slate-500">Mashhur:</span>
                  {popularAnimeList.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAnimeTitle(p)}
                      className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title / Episode Label */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Qism Nomi / Sarlavha
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`${animeTitle || 'Anime'} - ${episodeNumber}-qism`}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {/* Episode Number */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Qism (Ep)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={episodeNumber}
                    onChange={(e) => setEpisodeNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mavsum
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={seasonNumber}
                    onChange={(e) => setSeasonNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Sifat (Resolution)
                </label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="1080p">1080p (Full HD 60fps)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="480p">480p (SD)</option>
                  <option value="4K">4K Ultra HD</option>
                </select>
              </div>

              {/* Language / Translation */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tarjima / Ovoz
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="O'zbekcha (Tarjima)">O'zbekcha (Ovozli Tarjima)</option>
                  <option value="O'zbekcha (Subtitr)">O'zbekcha (Subtitr)</option>
                  <option value="Original (Yaponiya)">Original (Yaponiya audio)</option>
                  <option value="Ruscha (Dublyaj)">Ruscha (Dublyaj)</option>
                </select>
              </div>

              {/* Allowed Domain */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Domen Cheklovi (Hotlink Protection)</span>
                  <span className="text-[11px] text-emerald-400 font-normal">Faqat ushbu saytda ishlaydi</span>
                </label>
                <input
                  type="text"
                  value={allowedDomain}
                  onChange={(e) => setAllowedDomain(e.target.value)}
                  placeholder="animem.uz"
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-emerald-400 font-mono text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span>{chunkStatusText || 'PostgreSQL Serverga Bo\'laklab Yuklanmoqda...'}</span>
                  </span>
                  <span className="font-mono text-rose-400 font-bold">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-600 via-pink-500 to-indigo-500 transition-all duration-150 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Tezlik: <strong className="text-white">{uploadSpeed}</strong></span>
                  <span>{formatSize(uploadedBytes)} / {formatSize(totalBytes)}</span>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Bekor qilish
              </button>
              <button
                id="btn-start-upload"
                type="submit"
                disabled={isUploading || !file}
                className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Yuklanmoqda ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Yuklashni Boshlash</span>
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
