/**
 * YouTube Transcriber MCP Server
 * Tools: transcribe_youtube, add_youtube_video, search_transcripts,
 *        list_videos, get_video_transcript, remove_video, clear_all_videos
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  type CallToolResult,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';

import type { VideoData, SearchResult, TranscriptionEngine } from './types.js';
import { extractVideoId, extractUrlFromCommand, videoUrl, fetchVideoTitle } from './youtube.js';
import { transcribeWithCaptions } from './transcribers/captions.js';
import { transcribeWithScribe } from './transcribers/scribe.js';
import { loadTranscripts, saveTranscripts } from './storage.js';

const MAX_CONTEXT_WORDS = 20;

export class YouTubeTranscriberServer {
  private server: Server;
  private videos: Map<string, VideoData> = new Map();

  constructor() {
    this.server = new Server(
      { name: 'youtube-transcriber', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private text(content: string): CallToolResult {
    return { content: [{ type: 'text', text: content } as TextContent] };
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments ?? {};
        switch (request.params.name) {
          case 'transcribe_youtube':
            return await this.handleTranscribeCommand(args);
          case 'add_youtube_video':
            return await this.handleAddVideo(args);
          case 'search_transcripts':
            return await this.handleSearch(args);
          case 'list_videos':
            return this.handleList();
          case 'get_video_transcript':
            return this.handleGetTranscript(args);
          case 'remove_video':
            return await this.handleRemove(args);
          case 'clear_all_videos':
            return await this.handleClear();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Error in ${request.params.name}:`, msg);
        return this.text(`Error: ${msg}`);
      }
    });
  }

  private async handleTranscribeCommand(args: Record<string, unknown>): Promise<CallToolResult> {
    const command = String(args.command ?? '');
    const url = extractUrlFromCommand(command);
    if (!url) {
      return this.text(
        `Could not find a YouTube URL in: "${command}"\n\n` +
          `Try: "transcribe this url: https://www.youtube.com/watch?v=VIDEO_ID"`
      );
    }
    return this.handleAddVideo({ ...args, url });
  }

  private async handleAddVideo(args: Record<string, unknown>): Promise<CallToolResult> {
    const url = String(args.url ?? '');
    const language = String(args.language ?? 'en');
    const engine = (args.engine ?? 'captions') as TranscriptionEngine;

    const videoId = extractVideoId(url);
    if (!videoId) {
      return this.text(
        `Could not extract video ID from: ${url}\n\n` +
          `Supported formats:\n` +
          `  https://www.youtube.com/watch?v=VIDEO_ID\n` +
          `  https://youtu.be/VIDEO_ID\n` +
          `  VIDEO_ID (11 characters)`
      );
    }

    if (this.videos.has(videoId)) {
      return this.text(`Video ${videoId} is already loaded. Use list_videos to see all loaded videos.`);
    }

    const [title, transcriptionResult] = await Promise.all([
      fetchVideoTitle(videoId),
      engine === 'scribe'
        ? transcribeWithScribe(videoId, language)
        : transcribeWithCaptions(videoId, language),
    ]);

    const videoData: VideoData = {
      id: videoId,
      url: videoUrl(videoId),
      title,
      transcript: transcriptionResult.transcript,
      language: transcriptionResult.language,
      transcriptLength: transcriptionResult.transcript.length,
      totalDuration: transcriptionResult.totalDuration,
      engine,
      speakers: 'speakers' in transcriptionResult
        ? (transcriptionResult as { speakers: string[] }).speakers
        : undefined,
      addedAt: new Date().toISOString(),
    };

    this.videos.set(videoId, videoData);
    await saveTranscripts(this.videos);

    const speakerInfo =
      videoData.speakers && videoData.speakers.length > 0
        ? `\n- Speakers detected: ${videoData.speakers.join(', ')}`
        : '';

    return this.text(
      `Successfully loaded "${title}" (${videoId})\n` +
        `- Engine: ${engine}\n` +
        `- Transcript entries: ${videoData.transcriptLength}\n` +
        `- Language: ${videoData.language}\n` +
        `- Duration: ${formatDuration(videoData.totalDuration)}` +
        speakerInfo
    );
  }

  private handleSearch(args: Record<string, unknown>): CallToolResult {
    const query = String(args.query ?? '').trim();
    const videoIds = (args.videoIds as string[] | undefined) ?? Array.from(this.videos.keys());
    const contextWords = Math.min(Number(args.contextWords ?? 5), MAX_CONTEXT_WORDS);

    if (this.videos.size === 0) {
      return this.text('No videos loaded. Use add_youtube_video to add videos first.');
    }
    if (!query) {
      return this.text('Search query cannot be empty.');
    }

    const allResults: SearchResult[] = [];
    for (const videoId of videoIds) {
      const data = this.videos.get(videoId);
      if (!data) continue;
      for (const result of searchTranscript(data, query, contextWords)) {
        allResults.push(result);
      }
    }

    if (allResults.length === 0) {
      return this.text(`No matches found for "${query}".`);
    }

    allResults.sort((a, b) =>
      a.videoId !== b.videoId
        ? a.videoId.localeCompare(b.videoId)
        : a.timestamp - b.timestamp
    );

    let output = `Found ${allResults.length} match${allResults.length !== 1 ? 'es' : ''} for "${query}":\n\n`;
    let lastVideoId = '';

    for (const r of allResults) {
      if (r.videoId !== lastVideoId) {
        lastVideoId = r.videoId;
        output += `📹 ${r.videoTitle}\n   ${r.videoUrl}\n\n`;
      }
      const tsUrl = `${r.videoUrl}&t=${Math.floor(r.timestamp)}s`;
      const speakerLabel = r.speaker ? ` [${r.speaker}]` : '';
      output += `  🕐 ${formatTimestamp(r.timestamp)} — ${tsUrl}\n`;
      output += `     💬${speakerLabel} ${r.text}\n`;
      if (r.context !== r.text) {
        output += `     📝 ...${r.context}...\n`;
      }
      output += '\n';
    }

    return this.text(output);
  }

  private handleList(): CallToolResult {
    if (this.videos.size === 0) {
      return this.text('No videos currently loaded.');
    }

    let output = `Loaded videos (${this.videos.size}):\n\n`;
    for (const v of this.videos.values()) {
      const speakerLine =
        v.speakers && v.speakers.length > 0 ? `\n   Speakers: ${v.speakers.join(', ')}` : '';
      output +=
        `📹 ${v.title}\n` +
        `   ID: ${v.id} | Engine: ${v.engine}\n` +
        `   URL: ${v.url}\n` +
        `   Duration: ${formatDuration(v.totalDuration)} | Entries: ${v.transcriptLength} | Lang: ${v.language}` +
        speakerLine +
        '\n\n';
    }
    return this.text(output);
  }

  private handleGetTranscript(args: Record<string, unknown>): CallToolResult {
    const videoId = String(args.videoId ?? '');
    const format = String(args.format ?? 'text');

    const data = this.videos.get(videoId);
    if (!data) {
      return this.text(`Video ${videoId} not found. Use list_videos to see loaded videos.`);
    }

    if (format === 'json') {
      return this.text(JSON.stringify({ ...data, transcript: data.transcript }, null, 2));
    }

    let output = `Transcript: ${data.title} (${videoId})\nEngine: ${data.engine}\n\n`;
    for (const entry of data.transcript) {
      const speaker = entry.speaker ? `[${entry.speaker}] ` : '';
      output += `[${formatTimestamp(entry.start)}] ${speaker}${entry.text}\n`;
    }
    return this.text(output);
  }

  private async handleRemove(args: Record<string, unknown>): Promise<CallToolResult> {
    const videoId = String(args.videoId ?? '');
    const data = this.videos.get(videoId);
    if (!data) {
      return this.text(`Video ${videoId} not found.`);
    }
    this.videos.delete(videoId);
    await saveTranscripts(this.videos);
    return this.text(`Removed "${data.title}" (${videoId}).`);
  }

  private async handleClear(): Promise<CallToolResult> {
    const count = this.videos.size;
    this.videos.clear();
    await saveTranscripts(this.videos);
    return this.text(`Cleared ${count} video${count !== 1 ? 's' : ''} from memory and storage.`);
  }

  async run() {
    this.videos = await loadTranscripts();
    console.error(`YouTube Transcriber MCP Server v2.0.0 — loaded ${this.videos.size} stored video(s)`);
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function searchTranscript(
  data: VideoData,
  query: string,
  contextWords: number
): SearchResult[] {
  const results: SearchResult[] = [];
  const q = query.toLowerCase();

  data.transcript.forEach((entry, i) => {
    if (!entry.text.toLowerCase().includes(q)) return;

    const start = Math.max(0, i - contextWords);
    const end = Math.min(data.transcript.length, i + contextWords + 1);
    const context = data.transcript.slice(start, end).map((e) => e.text).join(' ');

    results.push({
      videoId: data.id,
      videoUrl: data.url,
      videoTitle: data.title,
      timestamp: entry.start,
      duration: entry.duration ?? 0,
      text: entry.text,
      context,
      speaker: entry.speaker,
      matchIndex: i,
    });
  });

  return results;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const ENGINE_PARAM = {
  engine: {
    type: 'string',
    enum: ['captions', 'scribe'],
    description:
      '"captions" (default) — fast, free, requires existing YouTube captions. ' +
      '"scribe" — ElevenLabs Scribe, works on any video, speaker diarization, word timestamps. Requires ELEVENLABS_API_KEY.',
    default: 'captions',
  },
};

const TOOL_DEFINITIONS = [
  {
    name: 'transcribe_youtube',
    description:
      'Process a natural language command to transcribe a YouTube video. ' +
      'Example: "transcribe this url: https://youtube.com/watch?v=..."',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Natural language command containing a YouTube URL.',
        },
        language: { type: 'string', description: 'Preferred language code (e.g. "en", "es").', default: 'en' },
        ...ENGINE_PARAM,
      },
      required: ['command'],
    },
  },
  {
    name: 'add_youtube_video',
    description: 'Add a YouTube video and extract its transcript.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'YouTube video URL or video ID.' },
        language: { type: 'string', description: 'Preferred language code.', default: 'en' },
        ...ENGINE_PARAM,
      },
      required: ['url'],
    },
  },
  {
    name: 'search_transcripts',
    description: 'Search for text across all loaded video transcripts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for.' },
        videoIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional video IDs to restrict search. Searches all if omitted.',
        },
        contextWords: {
          type: 'integer',
          description: 'Surrounding entries to include for context (max 20).',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_videos',
    description: 'List all loaded videos with metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_video_transcript',
    description: 'Get the full transcript of a specific video.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'YouTube video ID.' },
        format: { type: 'string', enum: ['text', 'json'], default: 'text' },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'remove_video',
    description: 'Remove a video from memory and persistent storage.',
    inputSchema: {
      type: 'object',
      properties: { videoId: { type: 'string', description: 'YouTube video ID to remove.' } },
      required: ['videoId'],
    },
  },
  {
    name: 'clear_all_videos',
    description: 'Remove all loaded videos from memory and persistent storage.',
    inputSchema: { type: 'object', properties: {} },
  },
];
