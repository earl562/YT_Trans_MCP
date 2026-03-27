/**
 * YouTube URL parsing and metadata fetching.
 * Uses oEmbed API (no auth required) for video titles.
 */

const URL_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:[^&]*&)*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
];

const NATURAL_LANGUAGE_URL_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s]*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/g,
  /youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})[^\s]*/g,
  /youtu\.be\/([a-zA-Z0-9_-]{11})[^\s]*/g,
];

export function extractVideoId(urlOrId: string): string | null {
  for (const pattern of URL_PATTERNS) {
    const match = urlOrId.match(pattern);
    if (match) return match[1];
  }
  // Bare video ID (11 chars, alphanumeric + _-)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }
  return null;
}

export function extractUrlFromCommand(command: string): string | null {
  for (const pattern of NATURAL_LANGUAGE_URL_PATTERNS) {
    pattern.lastIndex = 0; // reset global regex
    const match = command.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

interface OEmbedResponse {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

export async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(videoId))}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return `Video ${videoId}`;
    const data = (await response.json()) as OEmbedResponse;
    return data.title || `Video ${videoId}`;
  } catch {
    return `Video ${videoId}`;
  }
}
