// serve.ts — a tiny static server for playing the game locally:
//   node serve.ts   ->  http://localhost:8080
// Serves game/ with the right MIME types for ES modules and wasm-free
// assets. Standard library only.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
};

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let path = join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
}).listen(8080, () => console.log('spillway: http://localhost:8080'));
