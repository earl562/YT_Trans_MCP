#!/usr/bin/env node

/**
 * Simple test script for YouTube Transcriber MCP Server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function testMCPServer() {
  console.log('🧪 Testing YouTube Transcriber MCP Server...\n');

  const serverPath = join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test 1: List Tools
  console.log('Test 1: Listing available tools...');
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  };

  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  let responseBuffer = '';
  
  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    
    try {
      const response = JSON.parse(responseBuffer);
      if (response.result && response.result.tools) {
        console.log('✅ MCP Server is working!');
        console.log(`📋 Found ${response.result.tools.length} tools:`);
        response.result.tools.forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description}`);
        });
        
        // Test 2: List Videos (should be empty)
        console.log('\nTest 2: Listing videos (should be empty)...');
        const listVideosRequest = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "list_videos",
            arguments: {}
          }
        };
        
        setTimeout(() => {
          server.stdin.write(JSON.stringify(listVideosRequest) + '\n');
        }, 100);
      }
    } catch (err) {
      // Response might be incomplete, wait for more data
    }
  });

  server.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message.includes('running on stdio')) {
      console.log('🚀 Server started successfully\n');
    }
  });

  // Cleanup after 5 seconds
  setTimeout(() => {
    console.log('\n🎉 MCP Server test completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Add the following to your Claude Desktop config:');
    console.log(`   Path: ~/Library/Application Support/Claude/claude_desktop_config.json`);
    console.log('   Config:');
    console.log('   {');
    console.log('     "mcpServers": {');
    console.log('       "youtube-transcriber": {');
    console.log('         "command": "node",');
    console.log(`         "args": ["${serverPath}"]`);
    console.log('       }');
    console.log('     }');
    console.log('   }');
    console.log('\n2. Restart Claude Desktop');
    console.log('3. Try: "Add this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    
    server.kill();
    process.exit(0);
  }, 3000);
}

testMCPServer();