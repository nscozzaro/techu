#!/usr/bin/env node
// training/dashboard/server.mjs
// Minimal HTTP + SSE dashboard. No Express needed — uses Node's http module.
// Serves:
//   GET /           → training/dashboard/public/index.html
//   GET /live.json  → the live state from training/checkpoints/live.json
//   GET /stream     → SSE stream that re-sends live.json whenever it changes
//
// Usage: node training/dashboard/server.mjs [port]

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const liveFile = path.resolve(__dirname, '../checkpoints/live.json');

const PORT = Number(process.argv[2] ?? 3001);

const mimeFor = (p) => {
    const ext = path.extname(p);
    return {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.json': 'application/json'
    }[ext] ?? 'application/octet-stream';
};

const readLive = () => {
    try {
        return fs.readFileSync(liveFile, 'utf8');
    } catch {
        return JSON.stringify({ status: 'no_training_active', generation: 0, history: [] });
    }
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/live.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(readLive());
        return;
    }

    if (pathname === '/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive'
        });
        let lastSig = '';
        const tick = () => {
            if (res.destroyed || res.writableEnded) return;
            const content = readLive();
            const sig = content.length + '|' + content.slice(-200);
            if (sig !== lastSig) {
                lastSig = sig;
                res.write(`data: ${content.replace(/\n/g, ' ')}\n\n`);
            }
        };
        const interval = setInterval(tick, 1000);
        tick();
        req.on('close', () => clearInterval(interval));
        return;
    }

    // Static files from public/
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.join(publicDir, filePath);
    if (!safePath.startsWith(publicDir)) {
        res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(safePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeFor(safePath) });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Dashboard listening on http://127.0.0.1:${PORT}`);
    console.log(`Watching ${liveFile}`);
});
