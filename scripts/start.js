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

// Set environment variables
const env = {
  ...process.env,
  VITE_TEST_BUTTON: testButton ? 'true' : 'false',
  VITE_USE_PROXY: 'true', // Always use proxy in dev mode
};

// Default test image path if not set
if (!env.VITE_TEST_IMAGE_PATH) {
  env.VITE_TEST_IMAGE_PATH = join(dirname(__dirname), 'tests', 'aged-eh-that.jpeg');
}

console.log(`Starting CardCount...`);
console.log(`Test button: ${testButton ? 'ENABLED' : 'disabled'}`);
console.log(`Proxy: ENABLED (to avoid CORS)`);
if (testButton) {
  console.log(`Test image: ${env.VITE_TEST_IMAGE_PATH}`);
}

// Run proxy server and vite dev server concurrently
const concurrently = spawn('npx', ['concurrently', '-n', 'PROXY,VITE', '-c', 'blue,green', 
  '"node proxy.js"', 
  '"npx vite --host"'
], {
  env,
  stdio: 'inherit',
  shell: true,
});

concurrently.on('close', (code) => {
  process.exit(code);
});
