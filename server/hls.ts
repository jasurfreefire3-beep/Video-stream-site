import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

// Configure ffmpeg binary path
if (ffmpegInstaller && ffmpegInstaller.path) {
  try {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    console.log('[HLS Engine] FFmpeg loaded from:', ffmpegInstaller.path);
  } catch (e) {
    console.warn('[HLS Engine] Could not set FFmpeg path:', e);
  }
}

const HLS_BASE_DIR = path.join(process.cwd(), 'uploads', 'hls');
if (!fs.existsSync(HLS_BASE_DIR)) {
  fs.mkdirSync(HLS_BASE_DIR, { recursive: true });
}

export function getHlsDir(videoId: string): string {
  const dir = path.join(HLS_BASE_DIR, videoId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function isHlsReady(videoId: string): boolean {
  const m3u8Path = path.join(HLS_BASE_DIR, videoId, 'index.m3u8');
  return fs.existsSync(m3u8Path);
}

/**
 * Super-fast near zero-RAM HLS segmenter with automatic fallback.
 */
export async function convertMp4ToHls(videoId: string, videoPath: string): Promise<{ success: boolean; m3u8Path: string; error?: string }> {
  const outputDir = getHlsDir(videoId);
  const m3u8Path = path.join(outputDir, 'index.m3u8');

  if (fs.existsSync(m3u8Path)) {
    return { success: true, m3u8Path };
  }

  if (!fs.existsSync(videoPath)) {
    return { success: false, m3u8Path: '', error: 'Video fayli diskda topilmadi.' };
  }

  const runFfmpeg = (outputOptions: string[]) => {
    return new Promise<boolean>((resolve) => {
      const command = ffmpeg(videoPath)
        .outputOptions(outputOptions)
        .output(m3u8Path)
        .on('end', () => resolve(true))
        .on('error', (err) => {
          console.warn('[FFmpeg HLS Warning]:', err?.message);
          resolve(false);
        });
      
      try {
        command.run();
      } catch (e) {
        resolve(false);
      }
    });
  };

  console.log(`[HLS Transcoder] Starting HLS segmentation for video ${videoId} (${path.basename(videoPath)})...`);
  
  // 1. Try fast copy first
  let success = await runFfmpeg([
    '-codec: copy',
    '-start_number 0',
    '-hls_time 4',
    '-hls_list_size 0',
    '-f hls'
  ]);

  // 2. If copy fails, fallback to fast H.264 transcode
  if (!success) {
    console.log(`[HLS Transcoder] Fast copy failed. Transcoding to H.264/AAC for video ${videoId}...`);
    try {
      if (fs.existsSync(m3u8Path)) fs.unlinkSync(m3u8Path);
    } catch (e) {}

    success = await runFfmpeg([
      '-c:v libx264',
      '-preset ultrafast',
      '-crf 26',
      '-pix_fmt yuv420p',
      '-c:a aac',
      '-b:a 128k',
      '-ac 2',
      '-start_number 0',
      '-hls_time 4',
      '-hls_list_size 0',
      '-f hls'
    ]);
  }

  if (success && fs.existsSync(m3u8Path)) {
    console.log(`[HLS Transcoder] Video ${videoId} successfully prepared for HLS!`);
    return { success: true, m3u8Path };
  }

  return { success: false, m3u8Path: '', error: 'HLS segmentatsiyada xatolik yuz berdi.' };
}



