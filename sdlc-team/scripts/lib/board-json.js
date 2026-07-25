'use strict';
const crypto = require('crypto');
const path = require('path');
const { parseProject, slugify, parseAgentRef } = require('./parse');

const STATUS_BY_COLUMN = {
  'Blocked': 'blocked',
  'Backlog': 'backlog',
  'In Progress': 'progress',
  'Review': 'review',
  'Done': 'done',
};
const COLUMNS = ['blocked', 'backlog', 'progress', 'review', 'done'];

// The spec's six sticky-note colours. Assigned by hash of the agent id rather than
// by name, so any dynamically composed role gets a stable colour.
const NOTE_PALETTE = ['#FFE87A', '#FFB3C7', '#A8E6CF', '#C9B8F5', '#AEDDF7', '#FFD2A6'];

function colorFor(agentId) {
  const s = String(agentId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return NOTE_PALETTE[h % NOTE_PALETTE.length];
}

function normalizePriority(p) {
  const v = String(p || '').toLowerCase();
  if (v.startsWith('high')) return 'high';
  if (v.startsWith('low')) return 'low';
  return 'med';
}

// HH:MM out of an ISO timestamp, without constructing a Date (keeps it pure).
function hhmm(timestamp) {
  const m = String(timestamp || '').match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '--:--';
}

function nextGateFor(methodology, phase) {
  const m = String(methodology || '').toLowerCase();
  if (m.startsWith('waterfall')) return `phase gate: ${phase || 'current phase'}`;
  if (m.startsWith('kanban')) return 'gate every N completed cards';
  return `sprint review after ${phase || 'this sprint'}`;
}

function buildBoardJson(projectDir) {
  const p = parseProject(projectDir);

  const cards = [];
  for (const [column, status] of Object.entries(STATUS_BY_COLUMN)) {
    for (const c of p.board[column] || []) {
      cards.push({
        id: c.id,
        title: c.title,
        status,
        assignee: c.assigneeId || '',
        assigneeName: c.assigneeName || '',
        priority: normalizePriority(c.priority),
        question: c.question || '',
        questionFor: c.questionFor || '',
        dod: { done: c.dod.done, total: c.dod.total },
        branch: c.branch || null,
        reviewer: c.reviewer ? c.reviewer.id : null,
        reviewerName: c.reviewer ? c.reviewer.name : null,
        dependsOn: c.dependsOn || [],
      });
    }
  }

  const inProgress = cards.filter(c => c.status === 'progress');
  const busyBy = new Map(inProgress.map(c => [c.assignee, c.id]));

  const team = p.agents.map(a => {
    const ref = parseAgentRef(a.name);
    const id = ref.id || slugify(a.name);
    return {
      id,
      name: ref.name || a.name,
      role: a.role,
      color: colorFor(id),
      busy: busyBy.has(id),
      currentTask: busyBy.get(id) || null,
    };
  });

  // Derived — the markdown carries no explicit field for these.
  const awaitingHuman = p.awaitingHuman;
  const activeWorktrees = inProgress.length;
  const sprintRunning = activeWorktrees > 0 && !awaitingHuman;

  const activity = p.archive
    .slice()
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 8)
    .map(m => ({
      time: hhmm(m.timestamp),
      agent: slugify(m.from),
      text: m.summary || `${m.type || 'message'} on ${m.task || 'the board'}`,
    }));

  const payload = {
    revision: '',
    project: {
      id: path.basename(projectDir),
      name: p.name,
      path: p.path,
      methodology: p.methodology,
      phase: p.phase,
      round: p.round,
      maxRounds: Number(p.config['max-rounds-per-sprint'] || 20),
      parallelism: Number(p.config.parallelism || 3),
      activeWorktrees,
      sprintRunning,
      nextGate: nextGateFor(p.methodology, p.phase),
      awaitingHuman,
    },
    team,
    columns: COLUMNS.slice(),
    cards,
    activity,
  };

  // Content hash, not a timestamp: payload changed <=> revision changed.
  payload.revision = crypto.createHash('sha1')
    .update(JSON.stringify({ ...payload, revision: undefined }))
    .digest('hex');
  return payload;
}

function buildPayload(projectDirs, selectedId) {
  const dirs = (projectDirs || []).slice();
  if (!dirs.length) {
    return {
      revision: 'empty',
      project: null,
      projects: [],
      team: [],
      columns: COLUMNS.slice(),
      cards: [],
      activity: [],
      error: 'No SDLC projects found. Run /sdlc-init in a project, or start the dashboard with --root <dir>.',
    };
  }

  const chosen = dirs.find(d => path.basename(d) === selectedId) || dirs[0];
  const board = buildBoardJson(chosen);
  board.projects = dirs.map(d => {
    const b = d === chosen ? board : buildBoardJson(d);
    return {
      id: path.basename(d),
      name: b.project.name,
      methodology: b.project.methodology,
      phase: b.project.phase,
      round: b.project.round,
      active: d === chosen,
    };
  });
  return board;
}

module.exports = { STATUS_BY_COLUMN, COLUMNS, NOTE_PALETTE, colorFor, buildBoardJson, buildPayload };
