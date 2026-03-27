/**
 * Caption-based transcription engine.
 * Uses YouTube's auto-generated captions via youtube-transcript.
 * Fast and free — works only on videos that have captions enabled.
 */

// youtube-transcript has a packaging bug (type:module but CJS main) — import from the ESM dist directly
// @ts-expect-error no declaration file for deep path import
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import type { TranscriptEntry } from '../types.js';

export interface CaptionResult {
  transcript: TranscriptEntry[];
  language: string;
  totalDuration: number;
}

export async function transcribeWithCaptions(
  videoId: string,
  language = 'en'
): Promise<CaptionResult> {
  const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transcript: TranscriptEntry[] = (raw as any[]).map((entry) => ({
    text: entry.text as string,
    start: (entry.offset as number) / 1000,
    duration: (entry.duration as number) / 1000,
  }));

  const last = transcript[transcript.length - 1];
  const totalDuration = last ? last.start + (last.duration ?? 0) : 0;

  return { transcript, language, totalDuration };
}
