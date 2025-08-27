# YouTube Transcriber MCP Server

A Model Context Protocol (MCP) server that extracts transcripts from YouTube videos and provides powerful search functionality across multiple video transcripts. Built with TypeScript and Node.js for modern development.

## 🚀 Features

- 🎥 **Add YouTube videos** by URL or video ID
- 🔍 **Search across multiple transcripts** simultaneously
- ⏰ **Contextual results** with timestamps and surrounding text
- 📝 **Full transcript access** in multiple formats
- 🗂️ **Video management** (list, remove, clear)
- 🌐 **Multi-language support** for transcripts
- ⚡ **TypeScript** for type safety and better development experience
- 📦 **Modern Node.js** with ES modules

## ⚡ Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/earl562/YT_Trans_MCP.git
cd YT_Trans_MCP

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Test your setup
npm test
```

### 2. Configure Claude Desktop
Add to your claude_desktop_config.json:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "youtube-transcriber": {
      "command": "node",
      "args": ["/path/to/YT_Trans_MCP/dist/index.js"]
    }
  }
}
```

### 3. Restart Claude Desktop
Restart Claude Desktop to load the MCP server.

## 📋 Usage Examples

### Adding Videos
```
Add this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### Searching Transcripts
```
Search all videos for "artificial intelligence"
```

### Managing Videos
```
List all loaded videos
Get the full transcript for video dQw4w9WgXcQ
Remove video dQw4w9WgXcQ
Clear all loaded videos
```

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| add_youtube_video | Add a YouTube video and extract its transcript |
| search_transcripts | Search for text across all loaded transcripts |
| list_videos | List all loaded videos with basic information |
| get_video_transcript | Get the full transcript of a specific video |
| remove_video | Remove a specific video from memory |
| clear_all_videos | Remove all loaded videos |

## 📜 License
MIT License - see LICENSE file for details.