#!/usr/bin/env node

/**
 * Start script for CardCount app
 * 
 * Usage:
 *   npm start                    # Start normally
 *   npm start -- --test-button   # Start with test button enabled
 *   npm start -- -t              # Short flag
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const testButton = args.includes('--test-button') || args.includes('-t');

// Check for required API key
if (!process.env.VITE_VISION_API_KEY) {
  console.error('❌ ERROR: VITE_VISION_API_KEY environment variable is required');
  console.error('');
  console.error('Please set your Anthropic API key:');
  console.error('  export VITE_VISION_API_KEY="your_api_key_here"');
  console.error('');
  console.error('Or create a .env file:');
  console.error('  echo "VITE_VISION_API_KEY=your_api_key_here" > .env');
  console.error('');
  process.exit(1);
}

// Set environment variables
process.env.VITE_TEST_BUTTON = testButton ? 'true' : 'false';

// Default test image path if not set (must be in public/ dir for Vite to serve)
if (!process.env.VITE_TEST_IMAGE_PATH) {
  process.env.VITE_TEST_IMAGE_PATH = '/aged-eh-that.jpeg';
}

console.log(`Starting CardCount...`);
console.log(`Test button: ${testButton ? 'ENABLED' : 'disabled'}`);
console.log(`Proxy: ENABLED (to avoid CORS)`);
if (testButton) {
  console.log(`Test image: ${process.env.VITE_TEST_IMAGE_PATH}`);
}

// Run proxy server and vite dev server concurrently
const concurrently = spawn('npx', ['concurrently', '-n', 'PROXY,VITE', '-c', 'blue,green', 
  '"node proxy.js"', 
  '"npx vite --host"'
], {
  stdio: 'inherit',
  shell: true,
});

concurrently.on('close', (code) => {
  process.exit(code);
});
