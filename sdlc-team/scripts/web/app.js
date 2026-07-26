'use strict';

// data-col value -> demo's column heading text
const COLS = [
  ['next', 'Next'],
  ['flight', 'In flight'],
  ['shipped', 'Shipped'],
  ['killed', 'Killed'],
];

// status -> [data-stamp, data-stamp-wall, data-stamp-bp]; Next has none
const STAMPS = {
  flight: ['wip', 'on it ✍', 'W.I.P.'],
  shipped: ['merged', 'shipped ✓', 'SHIPPED'],
  killed: ['killed', 'dropped ✕', 'KILLED'],
};

const EMPTY_HINT = { wall: 'nothing here', blueprint: 'NO ITEMS — SEC CLEAR' };

let lastRevision = null;
let selectedProject = null;
let currentData = null;

/* ---------- theme ---------- */

function readStoredTheme() {
  try { return localStorage.getItem('boardroom.theme'); } catch { return null; }
}
function storeTheme(t) {
  try { localStorage.setItem('boardroom.theme', t); } catch { /* storage blocked — ignore */ }
}
function currentTheme() {
  return document.body.dataset.theme === 'blueprint' ? 'blueprint' : 'wall';
}

function applyTheme(theme) {
  const t = theme === 'blueprint' ? 'blueprint' : 'wall';
  document.body.dataset.theme = t;
  const btn = document.getElementById('themeToggle');
  btn.textContent = t === 'blueprint' ? '⇄ SPRINT WALL MODE' : '⇄ BLUEPRINT MODE';
  btn.setAttribute('aria-pressed', String(t === 'blueprint'));
  renderTitle();
  if (currentData) { renderHeader(currentData); renderNeedsYou(currentData); renderIncrements(currentData); renderBoard(); }  // flavour text + empty hints differ
}

function renderTitle() {
  const name = currentData && currentData.project ? currentData.project.name : 'boardroom';
  document.querySelector('.proj').textContent = currentTheme() === 'blueprint'
    ? `${name} — Construction Board`
    : `${name} — sprint wall`;
}

/* ---------- helpers ---------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
// <b>value</b> segments, like the demo's .meta markup
function bold(text) { return el('b', null, text); }

/* ---------- rendering ---------- */

function renderHeader(d) {
  const p = d.project;
  const meta = document.querySelector('.meta');
  meta.textContent = '';
  meta.appendChild(bold(p.methodology || '—'));
  meta.append(` · ${p.phase || '—'} · round `);
  meta.appendChild(bold(`${p.round}/${p.maxRounds}`));
  meta.append(' · ');
  meta.appendChild(bold(String(p.activeWorktrees)));
  meta.append(' worktrees active');
  if (p.sprintRunning) {
    meta.append(currentTheme() === 'blueprint'
      ? ` · GOOD SERVICE — ROUND ${p.round}/${p.maxRounds}`
      : ' · ⌁ sprint running');
  }

  const openQuestions = d.cards.filter(c => c.questionFor === 'human').length;
  const gate = document.querySelector('.gate');
  if (openQuestions > 0) {
    gate.dataset.attention = 'true';
    gate.textContent = `needs you: ${openQuestions} question${openQuestions === 1 ? '' : 's'}`;
  } else if (!p.sprintRunning && p.awaitingHuman) {
    gate.dataset.attention = 'true';
    gate.textContent = `paused — waiting on you · ${p.nextGate}`;
  } else {
    delete gate.dataset.attention;
    gate.textContent = `next gate: ${p.nextGate}`;
  }
}

function renderRail(d) {
  const list = document.getElementById('railList');
  const sel = document.getElementById('railSelect');
  list.textContent = '';
  sel.textContent = '';
  for (const p of d.projects || []) {
    const b = el('button', 'ptab');
    b.type = 'button';
    b.dataset.project = p.id;
    b.dataset.active = String(!!p.active);
    b.appendChild(el('b', null, p.name));
    b.appendChild(el('small', null, `${p.methodology || '—'} · ${p.phase || '—'} · r${p.round}`));
    b.addEventListener('click', () => { selectedProject = p.id; lastRevision = null; poll(); });
    list.appendChild(b);

    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    if (p.active) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => { selectedProject = sel.value; lastRevision = null; poll(); };
}

function renderTeam(d) {
  const host = document.getElementById('team');
  host.textContent = '';
  for (const m of d.team || []) {
    const s = el('span', 'member');
    s.dataset.agent = m.id;
    if (m.busy) s.setAttribute('data-busy', '');       // bare attribute, matches [data-busy]
    if (m.color) s.style.setProperty('--note', m.color);
    s.appendChild(el('span', 'face', (m.name || m.id || '?').trim().charAt(0).toUpperCase()));
    s.appendChild(el('b', null, m.name || m.id));
    s.append(' ');
    const detail = [m.role];
    if (m.busy && m.currentTask) detail.push(m.currentTask);
    if (m.rework >= 2) detail.push(`⚠ ${m.rework} rework`);
    s.appendChild(el('small', null, detail.filter(Boolean).join(' · ')));
    if (m.status === 'retired') s.dataset.retired = 'true';
    host.appendChild(s);
  }
}

// Boxes the human clicked whose inbox message the Manager has not applied yet.
const pendingTicks = new Set();          // `${cardId}:${index}`

async function toggleDod(card, index, nextChecked) {
  const key = `${card.id}:${index}`;
  pendingTicks.add(key);
  renderBoard();                          // optimistic: show it immediately as pending
  try {
    const r = await fetch('./api/dod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: selectedProject, card: card.id, index, checked: nextChecked,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    pendingTicks.delete(key);             // failed — drop the optimistic state
    renderBoard();
  }
}

function dodList(card) {
  const wrap = el('div', 'dodlist');
  card.dodItems.forEach((item, i) => {
    const key = `${card.id}:${i}`;
    const pending = pendingTicks.has(key);
    if (item.checked) pendingTicks.delete(key);   // the Manager applied it
    const row = el('label', 'dodbox');
    row.dataset.state = item.checked ? 'checked' : (pending ? 'pending' : 'open');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.checked || pending;
    box.addEventListener('click', ev => {
      ev.stopPropagation();                        // don't open the overlay
      toggleDod(card, i, !item.checked);
    });
    row.appendChild(box);
    row.appendChild(el('span', 'dodtext', item.text));
    if (pending && !item.checked) row.appendChild(el('span', 'dodpending', 'pending'));
    wrap.appendChild(row);
  });
  return wrap;
}

function cardNode(c, byId) {
  const a = el('article', 'card');
  a.dataset.status = c.status;
  const roleKey = c.role || c.assignee || '';
  a.dataset.agent = roleKey;                 // CSS colour hook (unchanged attribute name)
  if (c.priority) a.dataset.priority = c.priority;
  if (c.questionFor) a.dataset.questionFor = c.questionFor;
  const stamp = STAMPS[c.status];
  if (stamp) {
    a.dataset.stamp = stamp[0];
    a.dataset.stampWall = stamp[1];
    a.dataset.stampBp = stamp[2];
  }
  const agent = byId[roleKey];
  if (agent && agent.color) a.style.setProperty('--note', agent.color);

  a.appendChild(el('span', 'tid', c.id));
  a.appendChild(el('h3', 'ttl', c.title));
  const whoText = c.roleName || c.assigneeName || roleKey || 'unassigned';
  a.appendChild(el('div', 'who', c.reviewerName ? `${whoText} → ${c.reviewerName}` : whoText));

  if (c.shipsWhen) a.appendChild(el('div', 'ships', `ships when: ${c.shipsWhen}`));

  if (c.dodItems && c.dodItems.length) {
    const pct = Math.round((c.dod.done / c.dod.total) * 100);
    const d = el('div', 'dod', `DoD ${c.dod.done}/${c.dod.total}${c.branch ? ' · ' + c.branch : ''}`);
    const bar = el('div', 'bar');
    const i = document.createElement('i');
    i.style.width = pct + '%';
    bar.appendChild(i);
    d.appendChild(bar);
    a.appendChild(d);
    a.appendChild(dodList(c));
  }

  if (c.question) a.appendChild(el('p', 'q', c.question));

  a.tabIndex = 0;
  a.addEventListener('click', () => openOverlay(c));
  a.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOverlay(c); }
  });
  return a;
}

function renderBoard() {
  const d = currentData;
  const host = document.getElementById('board');
  host.textContent = '';
  if (!d || !d.project) return;
  const byId = Object.fromEntries((d.team || []).map(m => [m.id, m]));

  for (const [key, label] of COLS) {
    const col = el('section', 'col');
    col.dataset.col = key;
    const cards = (d.cards || []).filter(c => c.status === key);
    const h = el('h2', null, label);
    h.appendChild(el('span', 'count', String(cards.length)));
    col.appendChild(h);
    if (!cards.length) col.appendChild(el('p', 'empty', EMPTY_HINT[currentTheme()]));
    for (const c of cards) col.appendChild(cardNode(c, byId));
    host.appendChild(col);
  }
}

// Open questions addressed to the human. There is no separate queue file — a
// question(HUMAN) card sitting in Blocked IS the queue, so this is derived.
function humanQuestions(d) {
  return (d.cards || []).filter(c => c.questionFor === 'human' && c.question);
}

function renderNeedsYou(d) {
  const host = document.getElementById('needsyou');
  host.textContent = '';
  const open = humanQuestions(d);
  host.hidden = open.length === 0;
  if (!open.length) return;

  const n = open.length;
  host.appendChild(el('h4', null,
    currentTheme() === 'blueprint'
      ? `RFI SCHEDULE — ${n} OPEN`
      : `needs you — ${n} question${n === 1 ? '' : 's'}`));

  for (const c of open) {
    const row = el('div', 'qrow');
    row.tabIndex = 0;
    row.appendChild(el('span', 'qid', c.id));
    row.appendChild(el('span', 'qtext', c.question));
    if (c.roleName || c.role) row.appendChild(el('span', 'qrole', c.roleName || c.role));
    const open1 = () => openOverlay(c);
    row.addEventListener('click', open1);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open1(); }
    });
    host.appendChild(row);
  }
}

function renderIncrements(d) {
  const host = document.getElementById('increments');
  host.textContent = '';
  const list = d.increments || [];
  host.hidden = list.length === 0;
  if (!list.length) return;
  host.appendChild(el('h4', null,
    currentTheme() === 'blueprint' ? 'INCREMENTS IN FLIGHT' : 'in flight'));
  for (const inc of list) {
    const row = el('div', 'incrow');
    row.appendChild(el('span', 'incbranch', inc.branch));
    row.appendChild(el('span', 'inccards', `${inc.cards.length} cards`));
    row.appendChild(el('span', 'increles', inc.roles.join(', ')));
    row.appendChild(el('span', 'incdod', `DoD ${inc.dod.done}/${inc.dod.total}`));
    host.appendChild(row);
  }
}

function renderFeed(d) {
  const host = document.getElementById('feedRows');
  host.textContent = '';
  for (const a of (d.activity || []).slice(0, 8)) {
    const row = el('div', 'row');
    const t = document.createElement('time');
    t.textContent = a.time;
    row.appendChild(t);
    const s = el('span');
    s.appendChild(el('b', null, a.agent));
    s.append(` · ${a.text}`);
    row.appendChild(s);
    host.appendChild(row);
  }
}

function renderTitleBlock(d) {
  const p = d.project;
  const host = document.getElementById('titleblock');
  host.textContent = '';
  const rows = [
    ['PROJECT', String(p.name || '').toUpperCase()],
    ['ROUND', `${p.round} / ${p.maxRounds}`],
    ['PARALLEL', `${p.activeWorktrees} WORKTREES`],
    ['APPROVED BY', d.cards.some(c => c.questionFor === 'human') ? 'PENDING — YOU' : 'AUTO'],
  ];
  for (const [k, v] of rows) {
    const cell = el('div');
    cell.appendChild(el('small', null, k));
    cell.appendChild(el('b', null, v));
    host.appendChild(cell);
  }
}

/* ---------- overlay ---------- */

function openOverlay(c) {
  const body = document.getElementById('overlayBody');
  body.textContent = '';
  body.appendChild(el('h3', null, `${c.id} — ${c.title}`));
  body.appendChild(el('p', null,
    `status: ${c.status} · role: ${c.roleName || c.role || 'unassigned'}` +
    `${c.reviewerName ? ' · reviewer: ' + c.reviewerName : ''} · priority: ${c.priority}`));
  if (c.branch) body.appendChild(el('p', null, `branch: ${c.branch}`));
  if (c.dependsOn && c.dependsOn.length) {
    body.appendChild(el('p', null, `depends on: ${c.dependsOn.join(', ')}`));
  }
  if (c.question) body.appendChild(el('p', null, `question (${c.questionFor}): ${c.question}`));
  if (c.verifyRoles && c.verifyRoles.length) {
    body.appendChild(el('p', null,
      'must be verified by: ' + c.verifyRoles.map(v => `${v.id} ${v.name}`.trim()).join(', ')));
  }
  if (c.dod && c.dod.total) {
    body.appendChild(el('p', null, `definition of done: ${c.dod.done} of ${c.dod.total} complete`));
  }
  if (c.raw) {
    const pre = document.createElement('pre');
    pre.className = 'raw';
    pre.textContent = c.raw;            // textContent — never innerHTML
    body.appendChild(pre);
  }
  document.getElementById('overlay').hidden = false;
  document.getElementById('overlayClose').focus();
}

function closeOverlay() { document.getElementById('overlay').hidden = true; }

/* ---------- polling ---------- */

function showError(message) {
  document.body.dataset.state = 'error';
  document.querySelector('.meta').textContent = message;
  const board = document.getElementById('board');
  board.textContent = '';
  board.appendChild(el('p', 'empty', "can't find the board — is the sprint folder present?"));
}

async function poll() {
  try {
    const url = './board.json' + (selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : '');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.project) throw new Error(d.error || 'no projects found');

    if (d.revision === lastRevision) return;      // unchanged — no repaint
    delete document.body.dataset.state;           // clearing an error IS a change
    lastRevision = d.revision;
    currentData = d;
    selectedProject = d.project.id;

    renderTitle();
    renderHeader(d);
    renderRail(d);
    renderNeedsYou(d);
    renderIncrements(d);
    renderTeam(d);
    renderBoard();
    renderFeed(d);
    renderTitleBlock(d);
  } catch (e) {
    lastRevision = null;
    showError("can't find the board — is the sprint folder present? (" + e.message + ")");
  }
}

/* ---------- boot ---------- */

document.getElementById('themeToggle').addEventListener('click', () => {
  const next = currentTheme() === 'wall' ? 'blueprint' : 'wall';
  applyTheme(next);
  storeTheme(next);
});
document.getElementById('overlayClose').addEventListener('click', closeOverlay);
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target.id === 'overlay') closeOverlay();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });

applyTheme(readStoredTheme() || 'wall');
poll();
setInterval(poll, 5000);
