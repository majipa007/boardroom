'use strict';
const fs = require('fs');
const path = require('path');

const COLUMNS = ['Blocked', 'Backlog', 'In Progress', 'Review', 'Done'];

function safeMtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}
function readOr(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "Marcus (backend-developer)" -> {name:'Marcus', id:'backend-developer'}
// "Manager"                    -> {name:'Manager', id:'manager'}
function parseAgentRef(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { name: '', id: '' };
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { name: m[1].trim(), id: slugify(m[2]) };
  return { name: raw, id: slugify(raw) };
}

// Structured metadata values may carry a trailing "# note" per the card schema.
function stripInlineComment(value) {
  return String(value == null ? '' : value).replace(/\s+#.*$/, '').trim();
}

// project-config.md: "- key: value" lines, trailing "# comment" stripped.
// Multi-line block values (key: |) are skipped — nothing in the contract needs them.
function parseConfig(text) {
  const cfg = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^-\s*([a-z0-9-]+):\s*(.*)$/i);
    if (!m) continue;
    const value = m[2].replace(/\s+#.*$/, '').trim();
    if (value === '|' || value === '') continue;
    cfg[m[1]] = value;
  }
  return cfg;
}

// kanban.md -> { header:{methodology,phase,round}, board:{col:[card]} }
function parseKanban(text) {
  const header = { methodology: '', phase: '', round: 0 };
  const board = {};
  for (const c of COLUMNS) board[c] = [];
  let col = null;
  let card = null;
  let inDod = false;
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^>\s*methodology:\s*(.+?)\s*\|\s*phase:\s*(.+?)\s*$/))) {
      header.methodology = m[1]; header.phase = m[2]; continue;
    }
    if ((m = line.match(/^>\s*last-updated:.*\|\s*round:\s*(\d+)/))) {
      header.round = Number(m[1]); continue;
    }
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      col = board[m[1]] ? m[1] : null; card = null; inDod = false; continue;
    }
    if ((m = line.match(/^###\s+(T-\d+)\s*\|\s*(.+?)\s*$/))) {
      card = col ? {
        id: m[1], title: m[2], assignee: '', priority: '', column: col,
        assigneeName: '', assigneeId: '', branch: '', reviewer: null,
        dependsOn: [], question: '', questionFor: '',
        dod: { done: 0, total: 0 }, raw: '',
      } : null;
      if (card) board[col].push(card);
      inDod = false;
      if (card) card.raw = line;
      continue;
    }
    // Capture every line belonging to the current card, verbatim, before any
    // per-field matching below — spec §5 allows raw card markdown in the overlay.
    if (card) card.raw += (card.raw ? '\n' : '') + line;
    if (card && (m = line.match(/^\s*-\s*assignee:\s*(.+?)\s*$/))) {
      const clean = stripInlineComment(m[1]);
      card.assignee = clean;
      const ref = parseAgentRef(clean);
      card.assigneeName = ref.name;
      card.assigneeId = ref.id;
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*priority:\s*(.+?)\s*$/))) {
      card.priority = stripInlineComment(m[1]); inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*branch:\s*(.+?)\s*$/))) {
      card.branch = stripInlineComment(m[1]); inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*reviewer:\s*(.+?)\s*$/))) {
      card.reviewer = parseAgentRef(stripInlineComment(m[1])); inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*depends-on:\s*\[(.*?)\]\s*$/))) {
      card.dependsOn = m[1].split(',').map(s => s.trim()).filter(Boolean);
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*question(\(HUMAN\))?:\s*(.+?)\s*$/i))) {
      card.question = m[2];
      card.questionFor = m[1] ? 'human' : 'manager';
      inDod = false;
      continue;
    }
    if (card && /^\s*-\s*definition-of-done:\s*$/.test(line)) { inDod = true; continue; }
    if (card && inDod && (m = line.match(/^\s*-\s*\[([ xX])\]/))) {
      card.dod.total++;
      if (m[1] !== ' ') card.dod.done++;
      continue;
    }
    if (card && /^\s*-\s*[a-z-]+:/i.test(line)) { inDod = false; continue; }
  }
  return { header, board };
}

// team.md markdown table -> [{name, role}]
function parseTeam(text) {
  const agents = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!m) continue;
    const name = m[1].trim();
    const role = m[2].trim();
    if (!name || /^:?-+:?$/.test(name) || name.toLowerCase() === 'name') continue;
    agents.push({ name, role });
  }
  return agents;
}

// one inbox/archive message file -> {file,from,task,type,timestamp,summary}
function parseMessage(file, text) {
  const msg = { file: path.basename(file), from: '', task: '', type: '', timestamp: '', summary: '' };
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^(from|task|type|timestamp):\s*(.+?)\s*$/);
      if (m) msg[m[1]] = m[2];
    }
  }
  const sum = text.match(/##\s*Summary\s*\r?\n+([^\n]+)/);
  if (sum) msg.summary = sum[1].trim();
  return msg;
}

function listMessages(dir) {
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => parseMessage(f, readOr(path.join(dir, f))));
}

function computeLastActivity(sdlcDir) {
  let latest = safeMtime(path.join(sdlcDir, 'kanban.md'));
  for (const sub of ['inbox', 'archive']) {
    const d = path.join(sdlcDir, sub);
    let files = [];
    try { files = fs.readdirSync(d); } catch { files = []; }
    for (const f of files) latest = Math.max(latest, safeMtime(path.join(d, f)));
  }
  return latest;
}

function parseProject(projectDir) {
  const sdlc = path.join(projectDir, '.sdlc');
  const { header, board } = parseKanban(readOr(path.join(sdlc, 'kanban.md')));
  return {
    name: path.basename(projectDir),
    path: projectDir,
    lastActivity: computeLastActivity(sdlc),
    methodology: header.methodology,
    phase: header.phase,
    round: header.round,
    agents: parseTeam(readOr(path.join(sdlc, 'team.md'))),
    board,
    inbox: listMessages(path.join(sdlc, 'inbox')),
    archive: listMessages(path.join(sdlc, 'archive')),
    config: parseConfig(readOr(path.join(sdlc, 'project-config.md'))),
    awaitingHuman: fs.existsSync(path.join(sdlc, '.awaiting-human')),
  };
}

module.exports = {
  COLUMNS, parseKanban, parseTeam, parseMessage, listMessages, computeLastActivity, parseProject,
  slugify, parseAgentRef, parseConfig,
};
