#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('Starting dev servers...\n');

// Start API server
const api = spawn('node', ['--loader', 'ts-node/esm', 'src/api/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});

// Start Vite dev server
const web = spawn('npx', ['vite'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
});

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit(0);
});
