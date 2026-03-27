/**
 * ElevenLabs Scribe transcription engine.
 * Passes the YouTube URL directly via source_url — no audio download needed.
 * Works on any YouTube video regardless of whether captions exist.
 * Returns speaker diarization and word-level timestamps.
 */

import type { TranscriptEntry } from '../types.js';

const SCRIBE_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';

export interface ScribeResult {
  transcript: TranscriptEntry[];
  language: string;
  totalDuration: number;
  speakers: string[];
}

interface ScribeWord {
  text: string;
  start: number;
  end: number;
  speaker_id?: string;
  logprob?: number;
}

interface ScribeResponse {
  text: string;
  words?: ScribeWord[];
  language_code?: string;
}

export async function transcribeWithScribe(
  videoId: string,
  language?: string
): Promise<ScribeResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. Add it to your .env file to use the Scribe engine.'
    );
  }

  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const formData = new FormData();
  formData.append('model_id', 'scribe_v2');
  formData.append('source_url', sourceUrl);
  formData.append('diarize', 'true');
  if (language) {
    formData.append('language_code', language);
  }

  const response = await fetch(SCRIBE_ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs Scribe API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as ScribeResponse;

  const transcript = buildTranscriptFromWords(data.words ?? []);
  const totalDuration =
    transcript.length > 0
      ? transcript[transcript.length - 1].start + (transcript[transcript.length - 1].duration ?? 0)
      : 0;

  const speakerSet = new Set<string>();
  for (const entry of transcript) {
    if (entry.speaker) speakerSet.add(entry.speaker);
  }

  return {
    transcript,
    language: data.language_code ?? language ?? 'en',
    totalDuration,
    speakers: Array.from(speakerSet),
  };
}

function buildTranscriptFromWords(words: ScribeWord[]): TranscriptEntry[] {
  if (words.length === 0) return [];

  // Group consecutive words by speaker into sentence-like chunks
  const entries: TranscriptEntry[] = [];
  let chunk: ScribeWord[] = [];
  let currentSpeaker = words[0]?.speaker_id;

  const flushChunk = () => {
    if (chunk.length === 0) return;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    entries.push({
      text: chunk.map((w) => w.text).join(''),
      start: first.start,
      duration: last.end - first.start,
      speaker: currentSpeaker ?? undefined,
    });
    chunk = [];
  };

  for (const word of words) {
    // Start a new chunk on speaker change or sentence boundary (~8 words)
    if (word.speaker_id !== currentSpeaker || chunk.length >= 8) {
      flushChunk();
      currentSpeaker = word.speaker_id;
    }
    chunk.push(word);
  }
  flushChunk();

  return entries;
}
