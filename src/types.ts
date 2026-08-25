export interface VideoRecord {
  id: string;
  title: string;
  anime_title: string;
  episode_number: number;
  season_number: number;
  quality: string;
  language: string;
  file_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  mime_type: string;
  views_count: number;
  is_active: boolean | number;
  allowed_domain: string;
  poster_url?: string;
  description?: string;
  genres?: string;
  release_year?: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
  hls_url?: string;
  stream_url?: string;
  embed_url?: string;
  is_hls_ready?: boolean;
}

export interface DatabaseStats {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  total_videos: number;
  total_size_bytes: number;
  total_views: number;
  anime_count: number;
  latency_ms: number;
  error?: string;
}

export interface UploadMetadata {
  title: string;
  anime_title: string;
  episode_number: number;
  season_number: number;
  quality: string;
  language: string;
  poster_url?: string;
  allowed_domain?: string;
  description?: string;
  genres?: string;
  release_year?: number;
}

export interface PlayerTokenResponse {
  token: string;
  stream_url: string;
  expires_in: number;
}
