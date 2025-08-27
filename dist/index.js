#!/usr/bin/env node
/**
 * YouTube Transcriber MCP Server
 *
 * A Model Context Protocol server that extracts transcripts from YouTube videos
 * and provides search functionality across multiple video transcripts.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode, } from "@modelcontextprotocol/sdk/types.js";
import { YoutubeTranscript } from 'youtube-transcript';
class YouTubeTranscriberServer {
    server;
    videos = new Map();
    constructor() {
        this.server = new Server({
            name: "youtube-transcriber",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "transcribe_youtube",
                        description: "Process natural language commands to transcribe YouTube videos. Handles commands like 'transcribe this url: [YouTube URL]' or 'add this video: [URL]'",
                        inputSchema: {
                            type: "object",
                            properties: {
                                command: {
                                    type: "string",
                                    description: "Natural language command containing YouTube URL (e.g., 'transcribe this url: https://youtube.com/watch?v=...')",
                                },
                                language: {
                                    type: "string",
                                    description: "Preferred transcript language (e.g., 'en', 'es'). Optional.",
                                    default: "en",
                                },
                            },
                            required: ["command"],
                        },
                    },
                    {
                        name: "add_youtube_video",
                        description: "Add a YouTube video and extract its transcript for searching (direct URL input)",
                        inputSchema: {
                            type: "object",
                            properties: {
                                url: {
                                    type: "string",
                                    description: "YouTube video URL or video ID",
                                },
                                language: {
                                    type: "string",
                                    description: "Preferred transcript language (e.g., 'en', 'es'). Optional.",
                                    default: "en",
                                },
                            },
                            required: ["url"],
                        },
                    },
                    {
                        name: "search_transcripts",
                        description: "Search for text across all loaded video transcripts",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Text to search for in transcripts",
                                },
                                videoIds: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Optional: specific video IDs to search in. If not provided, searches all videos.",
                                },
                                contextWords: {
                                    type: "integer",
                                    description: "Number of surrounding transcript entries to include for context",
                                    default: 5,
                                },
                            },
                            required: ["query"],
                        },
                    },
                    {
                        name: "list_videos",
                        description: "List all loaded videos with their basic information",
                        inputSchema: {
                            type: "object",
                            properties: {},
                        },
                    },
                    {
                        name: "get_video_transcript",
                        description: "Get the full transcript of a specific video",
                        inputSchema: {
                            type: "object",
                            properties: {
                                videoId: {
                                    type: "string",
                                    description: "YouTube video ID",
                                },
                                format: {
                                    type: "string",
                                    enum: ["json", "text"],
                                    description: "Output format for the transcript",
                                    default: "text",
                                },
                            },
                            required: ["videoId"],
                        },
                    },
                    {
                        name: "remove_video",
                        description: "Remove a video from the loaded videos",
                        inputSchema: {
                            type: "object",
                            properties: {
                                videoId: {
                                    type: "string",
                                    description: "YouTube video ID to remove",
                                },
                            },
                            required: ["videoId"],
                        },
                    },
                    {
                        name: "clear_all_videos",
                        description: "Remove all loaded videos",
                        inputSchema: {
                            type: "object",
                            properties: {},
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case "transcribe_youtube":
                        return await this.transcribeFromCommand(request.params.arguments);
                    case "add_youtube_video":
                        return await this.addYouTubeVideo(request.params.arguments);
                    case "search_transcripts":
                        return await this.searchTranscripts(request.params.arguments);
                    case "list_videos":
                        return await this.listVideos(request.params.arguments);
                    case "get_video_transcript":
                        return await this.getVideoTranscript(request.params.arguments);
                    case "remove_video":
                        return await this.removeVideo(request.params.arguments);
                    case "clear_all_videos":
                        return await this.clearAllVideos(request.params.arguments);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error in ${request.params.name}:`, errorMessage);
                return {
                    content: [{ type: "text", text: `Error: ${errorMessage}` }],
                };
            }
        });
    }
    extractUrlFromCommand(command) {
        // Extract URLs from natural language commands
        const urlPatterns = [
            // Match YouTube URLs with or without timestamps
            /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s]*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/g,
            /youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})[^\s]*/g,
            /youtu\.be\/([a-zA-Z0-9_-]{11})[^\s]*/g,
        ];
        for (const pattern of urlPatterns) {
            const match = command.match(pattern);
            if (match)
                return match[0];
        }
        return null;
    }
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match)
                return match[1];
        }
        // If it's already just a video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
        return null;
    }
    getVideoInfo(videoId) {
        return {
            id: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: `Video ${videoId}`, // Would need YouTube Data API for real title
            language: "en",
        };
    }
    searchInTranscript(transcript, query, contextWords = 10) {
        const results = [];
        const queryLower = query.toLowerCase();
        transcript.forEach((entry, i) => {
            if (entry.text.toLowerCase().includes(queryLower)) {
                const startIdx = Math.max(0, i - contextWords);
                const endIdx = Math.min(transcript.length, i + contextWords + 1);
                const contextEntries = transcript.slice(startIdx, endIdx);
                const contextText = contextEntries.map(e => e.text).join(' ');
                results.push({
                    timestamp: entry.start,
                    duration: entry.duration || 0,
                    text: entry.text,
                    context: contextText,
                    matchIndex: i,
                });
            }
        });
        return results;
    }
    async transcribeFromCommand(args) {
        const { command, language = "en" } = args;
        // Extract URL from the natural language command
        const extractedUrl = this.extractUrlFromCommand(command);
        if (!extractedUrl) {
            return {
                content: [{ type: "text", text: `Error: Could not find a YouTube URL in the command: "${command}"

Please include a YouTube URL in your command, for example:
- "transcribe this url: https://www.youtube.com/watch?v=P2DfG5JEAmA"
- "add this video: https://youtu.be/P2DfG5JEAmA"` }],
            };
        }
        // Use the existing addYouTubeVideo logic
        return await this.addYouTubeVideo({ url: extractedUrl, language });
    }
    async addYouTubeVideo(args) {
        const { url, language = "en" } = args;
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            return {
                content: [{ type: "text", text: `Error: Could not extract video ID from URL: ${url}

Supported URL formats:
- https://www.youtube.com/watch?v=VIDEO_ID
- https://youtu.be/VIDEO_ID
- https://www.youtube.com/watch?v=VIDEO_ID&t=123s
- VIDEO_ID (11 characters)` }],
            };
        }
        try {
            // Check if video already exists
            if (this.videos.has(videoId)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Video ${videoId} is already loaded. Use 'list_videos' to see all loaded videos.`,
                        },
                    ],
                };
            }
            // Get transcript
            const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: language });
            // Convert to our format
            const transcript = transcriptData.map(entry => ({
                text: entry.text,
                start: entry.offset / 1000, // Convert from ms to seconds
                duration: entry.duration / 1000, // Convert from ms to seconds
            }));
            const videoInfo = this.getVideoInfo(videoId);
            const totalDuration = transcript.length > 0
                ? transcript[transcript.length - 1].start + (transcript[transcript.length - 1].duration || 0)
                : 0;
            // Store the video data
            const videoData = {
                ...videoInfo,
                transcript,
                language,
                transcriptLength: transcript.length,
                totalDuration,
            };
            this.videos.set(videoId, videoData);
            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully loaded video ${videoId}\n` +
                            `- URL: ${videoInfo.url}\n` +
                            `- Transcript entries: ${transcript.length}\n` +
                            `- Language: ${language}\n` +
                            `- Duration: ${totalDuration.toFixed(1)} seconds`,
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: `Error loading video ${videoId}: ${errorMessage}` }],
            };
        }
    }
    async searchTranscripts(args) {
        const { query, videoIds, contextWords = 5 } = args;
        if (this.videos.size === 0) {
            return {
                content: [{ type: "text", text: "No videos loaded. Use 'add_youtube_video' to add videos first." }],
            };
        }
        if (!query?.trim()) {
            return {
                content: [{ type: "text", text: "Error: Search query cannot be empty" }],
            };
        }
        const searchIds = videoIds || Array.from(this.videos.keys());
        const allResults = [];
        for (const videoId of searchIds) {
            const videoData = this.videos.get(videoId);
            if (!videoData)
                continue;
            const results = this.searchInTranscript(videoData.transcript, query, contextWords);
            results.forEach(result => {
                allResults.push({
                    videoId,
                    videoUrl: videoData.url,
                    videoTitle: videoData.title,
                    ...result,
                });
            });
        }
        if (allResults.length === 0) {
            const searchedVideos = searchIds.length <= 3 ? searchIds.join(", ") : `${searchIds.length} videos`;
            return {
                content: [{ type: "text", text: `No matches found for '${query}' in ${searchedVideos}` }],
            };
        }
        // Sort results by video and timestamp
        allResults.sort((a, b) => {
            if (a.videoId === b.videoId) {
                return a.timestamp - b.timestamp;
            }
            return a.videoId.localeCompare(b.videoId);
        });
        // Format results
        let resultText = `Found ${allResults.length} matches for '${query}':\n\n`;
        let currentVideo = null;
        allResults.forEach((result) => {
            if (result.videoId !== currentVideo) {
                currentVideo = result.videoId;
                resultText += `📹 ${result.videoTitle} (${result.videoId})\n`;
                resultText += `   ${result.videoUrl}\n\n`;
            }
            const timestampUrl = `${result.videoUrl}&t=${Math.floor(result.timestamp)}s`;
            const minutes = Math.floor(result.timestamp / 60);
            const seconds = Math.floor(result.timestamp % 60);
            resultText += `  🕐 ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} - ${timestampUrl}\n`;
            resultText += `     💬 ${result.text}\n`;
            if (result.context !== result.text) {
                resultText += `     📝 Context: ...${result.context}...\n`;
            }
            resultText += "\n";
        });
        return {
            content: [{ type: "text", text: resultText }],
        };
    }
    async listVideos(args) {
        if (this.videos.size === 0) {
            return {
                content: [{ type: "text", text: "No videos currently loaded." }],
            };
        }
        let resultText = `Loaded videos (${this.videos.size}):\n\n`;
        this.videos.forEach((videoData) => {
            const durationMins = Math.floor(videoData.totalDuration / 60);
            const durationSecs = Math.floor(videoData.totalDuration % 60);
            resultText += `📹 ${videoData.title}\n`;
            resultText += `   ID: ${videoData.id}\n`;
            resultText += `   URL: ${videoData.url}\n`;
            resultText += `   Duration: ${durationMins.toString().padStart(2, '0')}:${durationSecs.toString().padStart(2, '0')}\n`;
            resultText += `   Transcript: ${videoData.transcriptLength} entries (${videoData.language})\n\n`;
        });
        return {
            content: [{ type: "text", text: resultText }],
        };
    }
    async getVideoTranscript(args) {
        const { videoId, format = "text" } = args;
        const videoData = this.videos.get(videoId);
        if (!videoData) {
            return {
                content: [{ type: "text", text: `Error: Video ${videoId} not found. Use 'list_videos' to see loaded videos.` }],
            };
        }
        if (format === "json") {
            return {
                content: [
                    {
                        type: "text",
                        text: `Transcript for ${videoId} (JSON format):\n\n${JSON.stringify(videoData.transcript, null, 2)}`,
                    },
                ],
            };
        }
        else {
            // Text format
            let resultText = `Transcript for ${videoData.title} (${videoId}):\n`;
            resultText += `URL: ${videoData.url}\n\n`;
            videoData.transcript.forEach((entry) => {
                const minutes = Math.floor(entry.start / 60);
                const seconds = Math.floor(entry.start % 60);
                resultText += `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}] ${entry.text}\n`;
            });
            return {
                content: [{ type: "text", text: resultText }],
            };
        }
    }
    async removeVideo(args) {
        const { videoId } = args;
        const videoData = this.videos.get(videoId);
        if (!videoData) {
            return {
                content: [{ type: "text", text: `Error: Video ${videoId} not found.` }],
            };
        }
        this.videos.delete(videoId);
        return {
            content: [{ type: "text", text: `Removed video: ${videoData.title} (${videoId})` }],
        };
    }
    async clearAllVideos(args) {
        const count = this.videos.size;
        this.videos.clear();
        return {
            content: [{ type: "text", text: `Cleared ${count} video${count !== 1 ? 's' : ''} from memory.` }],
        };
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("YouTube Transcriber MCP Server running on stdio");
    }
}
const server = new YouTubeTranscriberServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map