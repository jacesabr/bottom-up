#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('Starting dev servers...\n');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// Start API server (tsx runs TS+ESM directly)
const api = spawn(npx, ['tsx', 'watch', 'src/api/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_ENV: 'development' },
});

// Start Vite dev server
const web = spawn(npx, ['vite'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_ENV: 'development' },
});

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit(0);
});
