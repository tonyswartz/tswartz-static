#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// WordPress slug redirects (Page Links To plugin targets).
const REDIRECTS = {
  '/music-fest': 'https://ellensburgmusicfestival.com/',
  '/guidecast': 'https://guidecastapp.com',
  '/instagram': 'https://instagram.com/tony.swartz',
  '/youtube': 'https://youtube.com/tswartz',
  '/law-firm': 'https://tonyswartzlaw.com',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);

  if (REDIRECTS[url]) {
    res.writeHead(301, { Location: REDIRECTS[url] });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  if (url.endsWith('/') && url.length > 1) url = url.slice(0, -1);
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (url.split('/').some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const serveFile = (pathToFile, statusCode = 200) => {
    fs.readFile(pathToFile, (err, data) => {
      if (err) {
        return fs.readFile(path.join(ROOT, '404.html'), (err404, data404) => {
          if (err404) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(404, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          });
          res.end(data404);
        });
      }
      const ext = path.extname(pathToFile).toLowerCase();
      res.writeHead(statusCode, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': (ext === '.html' || url.startsWith('/travel/')) ? 'no-cache' : 'public, max-age=3600',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
  };

  // /blog → blog/index.html
  if (!path.extname(url)) {
    const indexPath = path.join(ROOT, url.slice(1), 'index.html');
    if (fs.existsSync(indexPath)) return serveFile(indexPath);
  }

  serveFile(filePath);
});

server.listen(PORT, () => {
  console.log(`tswartz-static listening on :${PORT}`);
});
