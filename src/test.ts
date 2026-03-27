#!/usr/bin/env node
/**
 * Smoke test for yt-mcp core modules.
 * Run: npx ts-node --esm src/test.ts
 * Or after build: node dist/test.js
 */

import 'dotenv/config';
import { extractVideoId, extractUrlFromCommand, fetchVideoTitle } from './youtube.js';
import { transcribeWithCaptions } from './transcribers/captions.js';
import { loadTranscripts, saveTranscripts } from './storage.js';
import type { VideoData } from './types.js';

const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Astley - well-captioned
const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function run() {
  console.log('\n=== yt-mcp smoke tests ===\n');

  // 1. URL parsing
  console.log('1. URL parsing');
  assert(extractVideoId(TEST_URL) === TEST_VIDEO_ID, 'extract from full URL');
  assert(extractVideoId('https://youtu.be/dQw4w9WgXcQ') === TEST_VIDEO_ID, 'extract from youtu.be');
  assert(extractVideoId(TEST_VIDEO_ID) === TEST_VIDEO_ID, 'bare video ID');
  assert(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=30') === TEST_VIDEO_ID, 'youtu.be with timestamp');
  assert(extractVideoId('not-a-url') === null, 'invalid URL returns null');

  const cmd = 'transcribe this url: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s';
  assert(extractUrlFromCommand(cmd) !== null, 'extract URL from natural language command');

  // 2. oEmbed title
  console.log('\n2. oEmbed title fetch');
  const title = await fetchVideoTitle(TEST_VIDEO_ID);
  console.log(`   Title: "${title}"`);
  assert(title !== `Video ${TEST_VIDEO_ID}`, 'got real title (not placeholder)');
  assert(title.length > 0, 'title is non-empty');

  // 3. Captions transcription
  console.log('\n3. Caption-based transcription');
  try {
    const result = await transcribeWithCaptions(TEST_VIDEO_ID, 'en');
    assert(result.transcript.length > 0, 'transcript has entries');
    assert(result.totalDuration > 0, 'totalDuration > 0');
    assert(result.language === 'en', 'language is "en"');
    console.log(`   Entries: ${result.transcript.length}, Duration: ${result.totalDuration.toFixed(1)}s`);
    console.log(`   Sample: "${result.transcript[0]?.text}"`);
  } catch (err) {
    console.error(`   Error: ${err instanceof Error ? err.message : err}`);
    failed++;
  }

  // 4. Persistence round-trip
  console.log('\n4. Persistence (storage)');
  const testData: VideoData = {
    id: 'test123456a',
    url: 'https://www.youtube.com/watch?v=test123456a',
    title: 'Test Video',
    transcript: [{ text: 'hello world', start: 0, duration: 2 }],
    language: 'en',
    transcriptLength: 1,
    totalDuration: 2,
    engine: 'captions',
    addedAt: new Date().toISOString(),
  };
  const testMap = new Map([['test123456a', testData]]);
  await saveTranscripts(testMap);
  const loaded = await loadTranscripts();
  assert(loaded.has('test123456a'), 'saved video reloaded from disk');
  assert(loaded.get('test123456a')?.title === 'Test Video', 'data integrity preserved');

  // Clean up test entry
  loaded.delete('test123456a');
  await saveTranscripts(loaded);

  // 5. Scribe (only if key present)
  console.log('\n5. ElevenLabs Scribe');
  if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY === 'your_key_here') {
    console.log('   ⚠ ELEVENLABS_API_KEY not set — skipping Scribe test');
  } else {
    const { transcribeWithScribe } = await import('./transcribers/scribe.js');
    try {
      const result = await transcribeWithScribe(TEST_VIDEO_ID, 'en');
      assert(result.transcript.length > 0, 'Scribe returned transcript entries');
      assert(result.speakers !== undefined, 'speakers array present');
      console.log(`   Entries: ${result.transcript.length}, Speakers: [${result.speakers.join(', ')}]`);
    } catch (err) {
      console.error(`   Error: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
