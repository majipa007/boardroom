'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_REGISTRY = path.join(os.homedir(), '.sdlc-team', 'projects.json');

function readRegistry(registryPath = DEFAULT_REGISTRY) {
  try {
    const arr = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function hasSdlc(dir) {
  try { return fs.statSync(path.join(dir, '.sdlc')).isDirectory(); } catch { return false; }
}

// Recursively find dirs containing .sdlc/ under root; bounded depth; skip noise dirs.
function scanRoot(root, maxDepth = 4) {
  const found = [];
  const SKIP = new Set(['.git', 'node_modules', '.sdlc', 'inbox', 'archive']);
  (function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (hasSdlc(dir)) found.push(dir);
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1);
    }
  })(root, 0);
  return found;
}

function discoverProjects({ registryPath = DEFAULT_REGISTRY, root = null } = {}) {
  const candidates = [...readRegistry(registryPath)];
  if (root) candidates.push(...scanRoot(root));
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (hasSdlc(abs)) out.push(abs);
  }
  return out;
}

// Registry-only write. Never touches a project's .sdlc/.
function registerProject(projectDir, registryPath = DEFAULT_REGISTRY) {
  const abs = path.resolve(projectDir);
  const arr = readRegistry(registryPath);
  if (!arr.map(p => path.resolve(p)).includes(abs)) {
    arr.push(abs);
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(arr, null, 2) + '\n');
  }
  return abs;
}

if (require.main === module) {
  const i = process.argv.indexOf('--register');
  if (i !== -1) {
    const dir = process.argv[i + 1] || process.cwd();
    console.log(registerProject(dir));
  } else {
    console.log(discoverProjects({}).join('\n'));
  }
}

module.exports = { DEFAULT_REGISTRY, readRegistry, hasSdlc, scanRoot, discoverProjects, registerProject };
