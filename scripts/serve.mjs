import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') { res.writeHead(302, { Location: '/lab/index.html' }); res.end(); return; }
    const relative = path.replace(/^\/+/, '');
    // Serve only prototype assets, not the repository, .git, or local secrets.
    if (!/^(lab\/|src\/)/.test(relative) || relative.split('/').some(p => p.startsWith('.'))) {
      res.writeHead(404); res.end(); return;
    }
    const file = resolve(root, relative);
    if (!file.startsWith(resolve(root) + sep)) { res.writeHead(404); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(8765, '127.0.0.1', () => console.log('墨息实验室 http://127.0.0.1:8765'));
