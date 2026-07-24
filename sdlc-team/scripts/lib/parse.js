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

// kanban.md -> { header:{methodology,phase,round}, board:{col:[card]} }
function parseKanban(text) {
  const header = { methodology: '', phase: '', round: 0 };
  const board = {};
  for (const c of COLUMNS) board[c] = [];
  let col = null;
  let card = null;
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^>\s*methodology:\s*(.+?)\s*\|\s*phase:\s*(.+?)\s*$/))) {
      header.methodology = m[1]; header.phase = m[2]; continue;
    }
    if ((m = line.match(/^>\s*last-updated:.*\|\s*round:\s*(\d+)/))) {
      header.round = Number(m[1]); continue;
    }
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      col = board[m[1]] ? m[1] : null; card = null; continue;
    }
    if ((m = line.match(/^###\s+(T-\d+)\s*\|\s*(.+?)\s*$/))) {
      card = col ? { id: m[1], title: m[2], assignee: '', priority: '', column: col } : null;
      if (card) board[col].push(card);
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*assignee:\s*(.+?)\s*$/))) { card.assignee = m[1]; continue; }
    if (card && (m = line.match(/^\s*-\s*priority:\s*(.+?)\s*$/))) { card.priority = m[1]; continue; }
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
  };
}

module.exports = { COLUMNS, parseKanban, parseTeam, parseMessage, listMessages, computeLastActivity, parseProject };
