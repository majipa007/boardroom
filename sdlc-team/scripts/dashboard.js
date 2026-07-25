'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverProjects } = require('./lib/discover');
const { parseProject } = require('./lib/parse');
const { buildPayload } = require('./lib/board-json');

const WEB_DIR = path.join(__dirname, 'web');
const ASSETS = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.css': ['theme.css', 'text/css; charset=utf-8'],
};

function parseArgs(argv) {
  const args = { port: 8787, root: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--root') args.root = argv[++i];
  }
  return args;
}

function buildModel({ root = null, registryPath } = {}) {
  const dirs = discoverProjects({ root, registryPath });
  const projects = dirs.map(parseProject).sort((a, b) => b.lastActivity - a.lastActivity);
  return { generated: Date.now(), projects };
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
          .map(d => ({ d, t: parseProject(d).lastActivity }))
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

    // Legacy aggregate route (kept for backwards compatibility)
    if (pathname.startsWith('/api/projects')) {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildModel({ root, registryPath })));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('error building model');
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
  server.listen(args.port, () => {
    console.log(`SDLC dashboard running: http://localhost:${args.port}  (Ctrl-C to stop)`);
    if (!args.root) console.log('Tip: pass --root <workspace-dir> to also scan for projects not yet in the registry.');
  });
}

module.exports = { parseArgs, buildModel, createServer };
