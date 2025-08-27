#!/usr/bin/env node

/**
 * Test script for natural language command parsing
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function testNaturalLanguage() {
  console.log('🧪 Testing Natural Language Command Parsing...\n');

  const serverPath = join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test commands to try
  const testCommands = [
    "transcribe this url: https://www.youtube.com/watch?v=P2DfG5JEAmA&t=447s",
    "add this video: https://youtu.be/P2DfG5JEAmA",
    "please transcribe: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "invalid command without url"
  ];

  let testIndex = 0;

  server.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message.includes('running on stdio')) {
      console.log('🚀 Server started, testing natural language commands...\n');
      
      // Start testing commands
      runNextTest();
    }
  });

  function runNextTest() {
    if (testIndex >= testCommands.length) {
      console.log('\n🎉 Natural language testing completed!');
      console.log('\n📋 Updated Usage:');
      console.log('Now you can use natural commands like:');
      console.log('• "transcribe this url: https://www.youtube.com/watch?v=P2DfG5JEAmA&t=447s"');
      console.log('• "add this video: https://youtu.be/dQw4w9WgXcQ"');
      console.log('• "please transcribe: https://www.youtube.com/watch?v=example"');
      
      server.kill();
      process.exit(0);
      return;
    }

    const command = testCommands[testIndex];
    console.log(`Test ${testIndex + 1}: "${command}"`);

    const request = {
      jsonrpc: "2.0",
      id: testIndex + 10,
      method: "tools/call",
      params: {
        name: "transcribe_youtube",
        arguments: {
          command: command
        }
      }
    };

    server.stdin.write(JSON.stringify(request) + '\n');
    testIndex++;

    // Wait before next test
    setTimeout(runNextTest, 1000);
  }

  server.stdout.on('data', (data) => {
    try {
      const responses = data.toString().trim().split('\n');
      responses.forEach(responseStr => {
        if (!responseStr) return;
        
        const response = JSON.parse(responseStr);
        if (response.result && response.result.content) {
          const content = response.result.content[0].text;
          if (content.includes('Error: Could not find a YouTube URL')) {
            console.log('   ❌ Correctly rejected invalid command\n');
          } else if (content.includes('Error: Could not extract video ID')) {
            console.log('   ❌ URL parsing failed\n');
          } else if (content.includes('Successfully loaded video')) {
            console.log('   ✅ Successfully extracted and would process URL\n');
          } else if (content.includes('already loaded')) {
            console.log('   ✅ URL extracted, video already exists\n');
          } else {
            console.log('   📝 Response:', content.substring(0, 100) + '...\n');
          }
        }
      });
    } catch (err) {
      // Ignore JSON parsing errors for partial responses
    }
  });

  // Cleanup after 10 seconds
  setTimeout(() => {
    server.kill();
    process.exit(0);
  }, 10000);
}

testNaturalLanguage();