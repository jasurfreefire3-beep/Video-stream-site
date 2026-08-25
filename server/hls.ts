import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

// Configure ffmpeg binary path
if (ffmpegInstaller && ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  console.log('[HLS Engine] FFmpeg loaded from:', ffmpegInstaller.path);
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
 * Super-fast near zero-RAM HLS segmenter using codec copy (no re-encoding)
 * Takes 1-3 seconds per 200MB video without overloading Render RAM!
 */
export async function convertMp4ToHls(videoId: string, mp4Path: string): Promise<{ success: boolean; m3u8Path: string; error?: string }> {
  const outputDir = getHlsDir(videoId);
  const m3u8Path = path.join(outputDir, 'index.m3u8');

  if (fs.existsSync(m3u8Path)) {
    return { success: true, m3u8Path };
  }

  if (!fs.existsSync(mp4Path)) {
    return { success: false, m3u8Path: '', error: 'MP4 fayli diskda topilmadi.' };
  }

  return new Promise((resolve) => {
    console.log(`[HLS Transcoder] Starting ultra-fast HLS segmentation for video ${videoId}...`);
    
    ffmpeg(mp4Path)
      .outputOptions([
        '-codec: copy',                // Zero CPU / Ultra Low RAM copy
        '-start_number 0',
        '-hls_time 4',                 // 4 second segments for rapid seeking
        '-hls_list_size 0',            // Include all segments in index.m3u8
        '-f hls'
      ])
      .output(m3u8Path)
      .on('end', () => {
        console.log(`[HLS Transcoder] Video ${videoId} successfully converted to HLS (m3u8 + ts chunks)!`);
        resolve({ success: true, m3u8Path });
      })
      .on('error', (err: any) => {
        console.warn(`[HLS Transcoder Warning] Failed to segment into HLS:`, err.message);
        resolve({ success: false, m3u8Path: '', error: err.message });
      })
      .run();
  });
}
