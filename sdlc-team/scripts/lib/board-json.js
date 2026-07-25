'use strict';
const crypto = require('crypto');
const path = require('path');
const { parseProject, slugify, parseAgentRef, parseRoleRef } = require('./parse');

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

// HH:MM in the viewer's local time zone. Falls back to slicing the ISO string
// (its original, UTC-only behavior) if the timestamp doesn't parse as a Date.
function hhmm(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const m = String(timestamp || '').match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '--:--';
}

function nextGateFor(methodology, phase) {
  const m = String(methodology || '').toLowerCase();
  if (m.startsWith('waterfall')) return `phase gate: ${phase || 'current phase'}`;
  if (m.startsWith('kanban')) return 'gate every N completed cards';
  return `sprint review after ${phase || 'this sprint'}`;
}

// Config values are raw strings; fall back to the documented default when the
// value is missing OR non-numeric (JSON.stringify would otherwise emit null).
function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstSentence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : s).slice(0, 90);
}

function hashPayload(payload) {
  return crypto.createHash('sha1')
    .update(JSON.stringify({ ...payload, revision: undefined }))
    .digest('hex');
}

function buildBoardJson(projectDir) {
  const p = parseProject(projectDir);

  const cards = [];
  for (const [column, status] of Object.entries(STATUS_BY_COLUMN)) {
    for (const c of p.board[column] || []) {
      // The grouping/colour key is the stable role id when the card uses the registry,
      // otherwise the slugified legacy assignee id — so old boards keep working.
      const roleKey = (c.roleId || c.roleName) ? (c.roleId || slugify(c.roleName)) : (c.assigneeId || '');
      cards.push({
        id: c.id,
        title: c.title,
        status,
        role: roleKey,
        roleName: c.roleName || c.assigneeName || '',
        assignee: roleKey,                 // alias, kept for one version
        assigneeName: c.assigneeName || c.roleName || '',
        verifyRoles: c.verifyRoles || [],
        priority: normalizePriority(c.priority),
        question: c.question || '',
        questionFor: c.questionFor || '',
        dod: { done: c.dod.done, total: c.dod.total },
        branch: c.branch || null,
        reviewer: c.reviewer ? c.reviewer.id : null,
        reviewerName: c.reviewer ? c.reviewer.name : null,
        dependsOn: c.dependsOn || [],
        raw: c.raw || '',
      });
    }
  }

  const inProgress = cards.filter(c => c.status === 'progress');
  const busyBy = new Map(inProgress.map(c => [c.role, c.id]));

  // Registry roles when the project has one; legacy roster otherwise.
  const team = (p.roles && p.roles.length)
    ? p.roles.map(r => ({
        id: r.id,
        name: r.name,
        role: firstSentence(r.charter) || r.name,
        charter: r.charter,
        status: r.status,
        cardsCompleted: r.cardsCompleted,
        rework: r.rework,
        color: colorFor(r.id),
        busy: busyBy.has(r.id),
        currentTask: busyBy.get(r.id) || null,
      }))
    : p.agents.map(a => {
        const ref = parseAgentRef(a.name);
        const id = ref.id || slugify(a.name);
        return {
          id,
          name: ref.name || a.name,
          role: a.role,
          charter: '',
          status: 'active',
          cardsCompleted: 0,
          rework: 0,
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
      methodology: p.methodology,
      phase: p.phase,
      round: p.round,
      maxRounds: numOr(p.config['max-rounds-per-sprint'], 20),
      parallelism: numOr(p.config.parallelism, 3),
      maxRoleMints: numOr(p.config['max-role-mints-per-sprint'], 4),
      maxActiveRoles: numOr(p.config['max-active-roles'], 10),
      autopilot: String(p.config.autopilot || 'off').toLowerCase() === 'on' ? 'on' : 'off',
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
  payload.revision = hashPayload(payload);
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
  board.revision = hashPayload(board);
  return board;
}

module.exports = { STATUS_BY_COLUMN, COLUMNS, NOTE_PALETTE, colorFor, buildBoardJson, buildPayload };
