'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRegistry, hasSdlc, scanRoot, discoverProjects, registerProject } = require('../lib/discover');

function makeProject(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, '.sdlc'), { recursive: true });
  return dir;
}

test('hasSdlc detects a project dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const p = makeProject(base, 'alpha');
  assert.strictEqual(hasSdlc(p), true);
  assert.strictEqual(hasSdlc(base), false);
});

test('scanRoot finds nested .sdlc dirs', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  makeProject(base, 'alpha');
  makeProject(path.join(base, 'nested'), 'beta');
  const found = scanRoot(base).map(p => path.basename(p)).sort();
  assert.deepStrictEqual(found, ['alpha', 'beta']);
});

test('registerProject appends abs path once (idempotent)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const reg = path.join(base, 'registry.json');
  const p = makeProject(base, 'alpha');
  registerProject(p, reg);
  registerProject(p, reg);
  assert.deepStrictEqual(readRegistry(reg), [path.resolve(p)]);
});

test('discoverProjects unions registry + root scan, dedups, filters missing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const reg = path.join(base, 'registry.json');
  const a = makeProject(base, 'alpha');
  const b = makeProject(base, 'beta');
  registerProject(a, reg);
  // 'beta' only discoverable by scan; also put a stale non-existent path in the registry
  fs.writeFileSync(reg, JSON.stringify([path.resolve(a), '/nope/does/not/exist']));
  const found = discoverProjects({ registryPath: reg, root: base }).map(p => path.basename(p)).sort();
  assert.deepStrictEqual(found, ['alpha', 'beta']);
});

test('readRegistry returns [] for a missing file', () => {
  assert.deepStrictEqual(readRegistry('/no/such/registry.json'), []);
});
