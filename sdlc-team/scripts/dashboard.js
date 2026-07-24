'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverProjects } = require('./lib/discover');
const { parseProject } = require('./lib/parse');

function parseArgs(argv) {
  const args = { port: 8787, root: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--root') args.root = argv[++i];
  }
  return args;
}

function buildModel({ root = null } = {}) {
  const dirs = discoverProjects({ root });
  const projects = dirs.map(parseProject).sort((a, b) => b.lastActivity - a.lastActivity);
  return { generated: Date.now(), projects };
}

function createServer({ root = null } = {}) {
  const htmlPath = path.join(__dirname, 'dashboard.html');
  return http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      let html;
      try { html = fs.readFileSync(htmlPath, 'utf8'); }
      catch { html = '<!doctype html><h1>dashboard.html not found</h1>'; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (url.startsWith('/api/projects')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildModel({ root })));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
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
