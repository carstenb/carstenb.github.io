// Minimal static server that mimics GitHub Pages:
//  - /dir/  -> dir/index.html
//  - /x     -> tries x, x.html, x/index.html
//  - miss   -> 404.html with HTTP 404 (the address bar keeps the requested path)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = Number(process.argv[3] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function tryFile(p) {
  try {
    const st = fs.statSync(p);
    if (st.isFile()) return p;
    if (st.isDirectory()) {
      const idx = path.join(p, 'index.html');
      if (fs.existsSync(idx)) return idx;
    }
  } catch (_) {}
  return null;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const base = path.normalize(path.join(ROOT, urlPath));
  if (!base.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');

  const hit = tryFile(base) || tryFile(base + '.html');
  if (hit) {
    return send(res, 200, fs.readFileSync(hit), TYPES[path.extname(hit)] || 'application/octet-stream');
  }
  const notFound = path.join(ROOT, '404.html');
  if (fs.existsSync(notFound)) {
    return send(res, 404, fs.readFileSync(notFound), 'text/html; charset=utf-8');
  }
  send(res, 404, 'Not found', 'text/plain');
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
