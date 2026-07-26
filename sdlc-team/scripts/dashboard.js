'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverProjects } = require('./lib/discover');
const { computeLastActivity, parseProject } = require('./lib/parse');
const { buildPayload } = require('./lib/board-json');
const { writeDodCheck } = require('./lib/inbox-write');

function readJsonBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

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

    if (pathname === '/api/dod' && req.method === 'POST') {
      // Loopback-only write path: a request carrying a cross-origin Origin header
      // (e.g. a page on another site) is refused outright. No Origin at all (curl,
      // same-origin fetch in older browsers) is allowed through.
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'cross-origin write refused' }));
        return;
      }
      readJsonBody(req).then(body => {
        const id = String(body.project || '');
        // The project is chosen from the discovered set by exact basename — a
        // request can never point the writer at an arbitrary path.
        const dirs = discoverProjects({ root, registryPath });
        const dir = dirs.find(d => path.basename(d) === id);
        if (!dir) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unknown project/card, or index out of range' }));
          return;
        }
        const model = parseProject(dir);
        const card = Object.values(model.board).flat().find(c => c.id === body.card);
        if (!card || !Number.isInteger(body.index) ||
            body.index < 0 || body.index >= (card.dodItems || []).length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unknown project/card, or index out of range' }));
          return;
        }
        const boxText = card.dodItems[body.index].text;
        const file = writeDodCheck({
          projectDir: dir, cardId: body.card, index: body.index,
          checked: body.checked !== false, boxText,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      }).catch(e => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer({ root: args.root });
  // A busy port is the common case for a local tool you restart often — say so
  // plainly instead of dumping an unhandled 'error' event stack trace.
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${args.port} is already in use — another dashboard is probably still running.`);
      console.error(`Stop it, or start this one on a different port:  --port ${args.port + 1}`);
    } else {
      console.error(`Dashboard failed to start: ${e.message}`);
    }
    process.exit(1);
  });
  server.listen(args.port, '127.0.0.1', () => {
    console.log(`SDLC dashboard running: http://localhost:${args.port}  (Ctrl-C to stop)`);
    if (!args.root) console.log('Tip: pass --root <workspace-dir> to also scan for projects not yet in the registry.');
  });
}

module.exports = { parseArgs, createServer };
