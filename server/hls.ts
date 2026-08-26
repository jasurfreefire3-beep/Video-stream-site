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
 * Robust HLS segmenter supporting MP4, MKV, WebM, etc.
 * Always transcodes to universal H.264 / AAC to ensure 100% browser compatibility and prevent black screens.
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

  console.log(`[HLS Transcoder] Transcoding video ${videoId} (${path.basename(videoPath)}) to H.264/AAC HLS...`);

  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-ac 2',
        '-start_number 0',
        '-hls_time 4',
        '-hls_list_size 0',
        '-f hls'
      ])
      .output(m3u8Path)
      .on('end', () => {
        console.log(`[HLS Transcoder] Video ${videoId} successfully transcoded to HLS!`);
        resolve({ success: true, m3u8Path });
      })
      .on('error', (err: any) => {
        console.warn(`[HLS Transcoder Error] Failed to transcode video ${videoId}:`, err.message);
        resolve({ success: false, m3u8Path: '', error: err.message });
      })
      .run();
  });
}
