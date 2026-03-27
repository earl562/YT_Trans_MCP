#!/usr/bin/env node
import 'dotenv/config';
import { YouTubeTranscriberServer } from './server.js';

const server = new YouTubeTranscriberServer();
server.run().catch(console.error);
