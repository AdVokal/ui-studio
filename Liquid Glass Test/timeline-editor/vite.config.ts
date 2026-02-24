import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMELINE_PATH = resolve(__dirname, '../ui-base/src/remotion/timeline-data.json');

function timelineApiPlugin(): Plugin {
  return {
    name: 'timeline-api',
    configureServer(server) {
      server.middlewares.use('/api/timeline', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        if (req.method === 'GET') {
          try {
            const content = readFileSync(TIMELINE_PATH, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
          } catch {
            res.writeHead(500);
            res.end('Failed to read timeline data');
          }
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk; });
          req.on('end', () => {
            try {
              JSON.parse(body);
              writeFileSync(TIMELINE_PATH, body, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('{"ok":true}');
            } catch {
              res.writeHead(400);
              res.end('Invalid JSON');
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), timelineApiPlugin()],
  server: { port: 5174 },
});
