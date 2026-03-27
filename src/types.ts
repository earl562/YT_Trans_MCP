export type TranscriptionEngine = 'captions' | 'scribe';

export interface TranscriptEntry {
  text: string;
  start: number;        // seconds
  duration?: number;    // seconds
  speaker?: string;     // populated by Scribe diarization
}

export interface VideoData {
  id: string;
  url: string;
  title: string;
  transcript: TranscriptEntry[];
  language: string;
  transcriptLength: number;
  totalDuration: number;
  engine: TranscriptionEngine;
  speakers?: string[];  // unique speaker labels (Scribe only)
  addedAt: string;      // ISO timestamp
}

export interface SearchResult {
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  timestamp: number;
  duration: number;
  text: string;
  context: string;
  speaker?: string;
  matchIndex: number;
}
