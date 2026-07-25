'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverProjects } = require('./lib/discover');
const { computeLastActivity } = require('./lib/parse');
const { buildPayload } = require('./lib/board-json');

const WEB_DIR = path.join(__dirname, 'web');
const ASSETS = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.css': ['theme.css', 'text/css; charset=utf-8'],
};
const DEFAULT_PORT = 8787;

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, root: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') {
      const n = Number(argv[++i]);
      if (Number.isInteger(n) && n > 0) {
        args.port = n;
      } else {
        console.error(`Warning: invalid --port value, falling back to ${DEFAULT_PORT}`);
      }
    } else if (argv[i] === '--root') args.root = argv[++i];
  }
  return args;
}

function createServer({ root = null, registryPath } = {}) {
  return http.createServer((req, res) => {
    const raw = req.url || '/';
    const [pathname, query = ''] = raw.split('?');

    // Static page
    if (pathname === '/' || pathname === '/index.html') {
      let html;
      try { html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8'); }
      catch { html = '<!doctype html><h1>dashboard assets missing</h1>'; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Static assets (fixed allow-list — no user-controlled path ever reaches the FS)
    if (ASSETS[pathname]) {
      const [file, type] = ASSETS[pathname];
      try {
        const body = fs.readFileSync(path.join(WEB_DIR, file), 'utf8');
        res.writeHead(200, { 'Content-Type': type });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('asset not found');
      }
      return;
    }

    // The board contract
    if (pathname === '/board.json') {
      try {
        const selected = new URLSearchParams(query).get('project') || undefined;
        const dirs = discoverProjects({ root, registryPath })
          .map(d => ({ d, t: computeLastActivity(path.join(d, '.sdlc')) }))
          .sort((a, b) => b.t - a.t)
          .map(x => x.d);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(buildPayload(dirs, selected)));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'failed to build the board: ' + e.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer({ root: args.root });
  server.listen(args.port, '127.0.0.1', () => {
    console.log(`SDLC dashboard running: http://localhost:${args.port}  (Ctrl-C to stop)`);
    if (!args.root) console.log('Tip: pass --root <workspace-dir> to also scan for projects not yet in the registry.');
  });
}

module.exports = { parseArgs, createServer };
