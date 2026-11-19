import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

// Strict static preview: unlike Vite's SPA fallback, unknown Pages paths really 404.
const root = resolve('dist'), base = '/our-time/', port = Number(process.env.PORT || 4180);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/our-time') { response.writeHead(301, { Location: base }); response.end(); return; }
    if (!url.pathname.startsWith(base)) { response.writeHead(404); response.end('Not found'); return; }
    const suffix = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    const file = resolve(root, suffix);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error();
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Strict Pages preview: http://127.0.0.1:${port}${base}`));
