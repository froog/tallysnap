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
  TEST_BUTTON: testButton ? 'true' : 'false',
};

// Default test image path if not set
if (!env.TEST_IMAGE_PATH) {
  env.TEST_IMAGE_PATH = join(dirname(__dirname), 'tests', 'aged-eh-that.jpeg');
}

console.log(`Starting CardCount...`);
console.log(`Test button: ${testButton ? 'ENABLED' : 'disabled'}`);
if (testButton) {
  console.log(`Test image: ${env.TEST_IMAGE_PATH}`);
}

// Run vite dev server
const vite = spawn('npx', ['vite'], {
  env,
  stdio: 'inherit',
  shell: true,
});

vite.on('close', (code) => {
  process.exit(code);
});
