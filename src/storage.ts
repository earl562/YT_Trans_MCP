/**
 * Persistence layer — saves/loads transcript data to ~/.yt-mcp/transcripts.json.
 * Transcripts survive server restarts.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { VideoData } from './types.js';

const STORAGE_DIR = join(homedir(), '.yt-mcp');
const STORAGE_PATH = join(STORAGE_DIR, 'transcripts.json');

export async function loadTranscripts(): Promise<Map<string, VideoData>> {
  try {
    const raw = await readFile(STORAGE_PATH, 'utf-8');
    const entries = JSON.parse(raw) as [string, VideoData][];
    return new Map(entries);
  } catch (err: unknown) {
    // File not found on first run — start fresh
    if (isNodeError(err) && err.code === 'ENOENT') {
      return new Map();
    }
    console.error('Failed to load transcripts from disk:', err);
    return new Map();
  }
}

export async function saveTranscripts(videos: Map<string, VideoData>): Promise<void> {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    const entries = Array.from(videos.entries());
    await writeFile(STORAGE_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save transcripts to disk:', err);
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
