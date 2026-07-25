# boardroom Dashboard — Frontend Specification

> **Deliverable:** the web dashboard for the `boardroom` SDLC plugin, replacing the current
> plain UI. Two visual themes — **Sprint Wall** (default) and **Blueprint** — switchable by a
> toggle in the header, both skinning the **same DOM**.
>
> **Pixel reference:** `boardroom-dashboard-demo.html` shipped alongside this spec is the
> source of truth for look & feel. Match it. Do not "improve" it toward generic component
> library styles. Where this document and the demo disagree, the demo wins for visuals and
> this document wins for behavior/data.

---

## 1. Architecture & constraints

- **Stack:** single static page — vanilla HTML + CSS + JS, no framework, no build step.
  One HTML file (or html + one css + one js file) served by the plugin.
- **Serving:** the plugin serves the dashboard locally (e.g. `python3 -m http.server` /
  a tiny node server started by a plugin script) with a JSON endpoint, **or** regenerates a
  static `board.json` next to the HTML. Builder's choice; the frontend must only depend on
  fetching `./board.json`.
- **Data source:** the plugin converts `.sdlc/kanban.md`, `.sdlc/team.md`,
  `.sdlc/project-config.md`, and the newest entries of `.sdlc/archive/` into `board.json`
  (schema in §2). **The frontend never parses markdown itself.**
- **Refresh:** poll `./board.json` every **5 seconds**; re-render only if the payload changed
  (compare a `revision` field or hash). No websockets in v1.
- **No external dependencies** except Google Fonts (Caveat, Nunito, Oswald, IBM Plex Mono).
  If fonts fail to load, fall back to `cursive`, `sans-serif`, `monospace` — layout must not break.

## 2. Data contract — `board.json`

```json
{
  "revision": "2026-07-25T12:41:07Z",
  "project": { "name": "splitmate", "methodology": "hybrid",
               "phase": "Implementation (Foundation)", "round": 3, "maxRounds": 20,
               "parallelism": 3, "activeWorktrees": 3, "sprintRunning": true,
               "nextGate": "sprint review after Foundation", "awaitingHuman": false },
  "team": [
    { "id": "priya", "name": "Priya", "role": "manager", "busy": false, "currentTask": null },
    { "id": "marcus", "name": "Marcus", "role": "backend", "busy": true, "currentTask": "T-005" }
  ],
  "columns": ["blocked", "backlog", "progress", "review", "done"],
  "cards": [
    { "id": "T-006", "title": "Authz + rate-limit middleware", "status": "blocked",
      "assignee": "marcus", "priority": "high",
      "question": "Redis-backed rate limiting or in-memory for v1?", "questionFor": "human",
      "dod": { "done": 0, "total": 4 }, "branch": null, "reviewer": null, "dependsOn": [] },
    { "id": "T-002", "title": "Docker + Postgres + Prisma", "status": "review",
      "assignee": "marcus", "priority": "high", "reviewer": "sofia",
      "dod": { "done": 3, "total": 4 }, "branch": "sdlc/T-002-docker" }
  ],
  "activity": [
    { "time": "12:41", "agent": "marcus", "text": "status update on T-005 · 6 files changed" }
  ]
}
```

Rules: `status` ∈ columns list; `priority` ∈ `high|med|low`; `activity` is the 8 newest
archive entries, newest first; unknown fields must be ignored (forward compatibility).

## 3. DOM structure (the theme contract — do not deviate)

Both themes style this exact skeleton. Class names and data attributes are the API between
markup and the two stylesheets:

```
body[data-theme="wall"|"blueprint"]
├── header.hdr
│   ├── h1.proj                      ← project title (theme JS may reword, see §6)
│   ├── span.meta                    ← methodology · phase · round x/y · n worktrees
│   ├── span.gate                    ← next human gate
│   └── button.toggle#themeToggle    ← theme switch (aria-pressed)
├── section.team
│   └── span.member[data-agent][data-busy?]
│       ├── span.face                ← initial avatar (Wall only; Blueprint hides it)
│       ├── b (name) + small (role)
├── main.board
│   └── section.col[data-col] ×5     ← blocked | backlog | progress | review | done
│       ├── h2 (label + span count)
│       └── article.card[data-status][data-agent][data-priority?]
│                        [data-stamp?][data-stamp-wall][data-stamp-bp]
│           ├── span.tid             ← "T-014"
│           ├── h3.ttl               ← title
│           ├── div.who              ← "Marcus" or "Marcus → Sofia" when reviewer set
│           ├── div.dod  (optional)  ← "DoD d/t · branch" + div.bar > i[width:%]
│           └── p.q      (optional)  ← blocked question text (theme adds its own prefix)
├── footer.feed
│   ├── h4 + one div per activity row (time + text)
└── div.titleblock                   ← Blueprint-only drawing title block (hidden in Wall)
```

Stamps mapping (set both attributes; each theme renders its own wording via CSS
`content: attr(...)`):

| Card state          | data-stamp | data-stamp-wall | data-stamp-bp |
|---------------------|-----------|-----------------|---------------|
| blocked             | hold      | held ✋          | HOLD          |
| in progress         | wip       | on it ✍         | W.I.P.        |
| review              | inspect   | checking 👀     | INSPECT       |
| done (merged)       | merged    | merged ✓        | MERGED        |
| backlog             | *(none)*  | —               | —             |

## 4. Theme tokens

### 4.1 Sprint Wall (default)

| Token        | Value | Use |
|--------------|-------|-----|
| wall bg      | radial-gradient `#E9E4DC → #DFD8CC` | page background (plaster wall) |
| ink          | `#2E2A26` | text |
| dim          | `#8A8177` | secondary text |
| ok / alarm / warn | `#3E8E5A` / `#B33A3A` / `#B07A1F` | stamps, busy tag, pins |
| agent notes  | marcus `#FFE87A` · elena `#FFB3C7` · jamey `#A8E6CF` · sofia `#C9B8F5` · dev `#AEDDF7` · priya `#FFD2A6` | sticky-note & avatar fills |
| display type | **Caveat** 600/700 | project title, column tape labels, card titles, stamps |
| body type    | **Nunito** 400–800 | everything else |

Signature details: cards are sticky notes with a red push-pin (`::before` radial gradient),
alternating rotations (`nth-of-type` odd −1.8°, even +1.6°), hover flattens to 0° and scales
1.05; column headers are white "painter's tape" strips with a −1° tilt; card shadow
`2px 5px 9px rgba(0,0,0,.18)`; columns separated by 2px dashed dividers; high priority shows
🔥 after the task id; the activity feed is a white rounded strip.

### 4.2 Blueprint

| Token        | Value | Use |
|--------------|-------|-----|
| paper        | linear-gradient 135° `#123C7A → #0E3168` | page background |
| grid         | `rgba(214,228,255,.16)` 1px repeating lines every 24px, both axes | drafting-paper grid overlay |
| linework     | `rgba(214,228,255,.55)` | all borders, 1px |
| ink          | `#E8F0FF` · dim `#9DB4E0` | text |
| ok / warn / alarm | `#7CE3A9` / `#FFD37A` / `#FF9C8F` | MERGED / INSPECT / HOLD + RFI |
| display type | **Oswald** 500–700, letter-spaced (.1–.25em), uppercase | title, column labels, card titles, stamps, title block |
| body type    | **IBM Plex Mono** 400–600 | everything else |

Signature details: cards are spec sheets — `rgba(9,34,74,.55)` fill, 1px linework border,
square corners; stamps top-right, rotated −7°, 2px border, Oswald; blocked question renders
as an **RFI** callout (left 2px alarm border, `RFI → HUMAN:` prefix via CSS); team roster is
a bordered "crew manifest" strip with dashed separators and no avatars; the activity feed is a
bordered **REVISION HISTORY** table; a **title block** (project / round / parallel / approved-by)
appears bottom-right — hidden entirely in Wall theme. `busy` members show `▸ RUNNING` in ok-green.

## 5. Behavior

- **Rendering:** JS fetches `board.json`, builds the DOM of §3, and fills column counts.
  Cards render in the order received. Empty column → keep the header with count 0 and show a
  theme-appropriate empty hint (Wall: faint handwritten "nothing here"; Blueprint: dashed
  outline placeholder labeled `NO ITEMS — SEC CLEAR`).
- **Blocked emphasis:** if any card has `questionFor: "human"`, the `.gate` element switches
  to an attention state (Wall: red-bordered note reading "needs you: <n> question(s)";
  Blueprint: `APPROVED BY: PENDING — YOU` in the title block plus warn-colored gate text).
- **Card click:** v1 opens a plain detail overlay (same theme surface) showing the full card:
  what, full DoD checklist with checked boxes, status-log, branch, dependencies. Close on
  Esc / backdrop click. (Raw markdown of the card is acceptable content for v1.)
- **Activity feed:** newest first, max 8 rows, relative times not required (HH:MM is fine).
- **Sprint state:** `sprintRunning: true` shows a subtle live indicator in `.meta`
  (Wall: green "⌁ sprint running"; Blueprint: `GOOD SERVICE — ROUND 3/20` style text). When
  false and `awaitingHuman` true, show the paused/gate state prominently instead.

## 6. Theme toggle

- Single button `#themeToggle` in the header. Click flips `body[data-theme]` between
  `wall` and `blueprint`. **All visual change must come from CSS keyed on that attribute** —
  the only JS on toggle is: set the attribute, update button label (`⇄ BLUEPRINT MODE` /
  `⇄ SPRINT WALL MODE`), update `aria-pressed`, and swap the `h1.proj` flavor text
  ("splitmate — sprint wall" / "Splitmate — Construction Board").
- **Persistence:** store the choice in `localStorage` key `boardroom.theme`; restore on load;
  default `wall` when unset or storage unavailable (wrap access in try/catch — must not crash
  in storage-restricted contexts).
- Toggle is keyboard operable (it's a real `<button>`), visible focus ring in both themes.
- Theme transition: background/color transition ≤ 300ms; disabled entirely under
  `prefers-reduced-motion: reduce` (as are pin wobbles, hover scaling, and any animation).

## 7. Responsive & accessibility floor

- Breakpoints: 5 columns → 2 (`≤1100px`) → 1 (`≤640px`). Header wraps; team roster wraps
  (Blueprint manifest becomes horizontally scrollable rather than wrapping mid-cell).
- Contrast: all text ≥ WCAG AA against its surface in both themes (check ink-on-sticky
  colors; darken note text to `#2E2A26` always in Wall).
- Semantics: columns are `section` with `h2`; cards are `article`; feed uses `time`.
  Status/priority conveyed by text (stamps, labels), never by color alone.
- The board must be readable with CSS entirely disabled (plain document order:
  header → team → columns in order → feed).

## 8. Multi-project sidebar (parity with current UI)

The existing UI lists SDLC projects on the left. Keep it: a collapsible left rail listing
projects (name · methodology · phase · round), current one highlighted; selecting a project
swaps which `board.json` is loaded. The rail restyles per theme (Wall: white paper tabs;
Blueprint: bordered index panel labeled `SHEET INDEX`). On `≤1100px` it collapses to a
dropdown in the header.

## 9. Acceptance criteria

- [ ] Toggling themes changes **every** surface (bg, type, cards, roster, feed, stamps,
      empty states, scrollbars if styled) with zero layout jumps or reflow glitches.
- [ ] Theme survives page reload (localStorage) and defaults to Wall gracefully without it.
- [ ] Board renders correctly from `board.json` alone; malformed/missing file shows a
      theme-styled error state ("can't find the board — is the sprint folder present?"),
      never a blank page or console-only failure.
- [ ] 5s polling updates counts, card positions, DoD bars, busy badges, and feed without
      flicker (no full-page repaint if revision unchanged).
- [ ] A blocked card with `questionFor: human` is impossible to miss in both themes.
- [ ] Demo parity: side-by-side with `boardroom-dashboard-demo.html`, each theme is visually
      indistinguishable for the same data.
- [ ] Keyboard: toggle, project rail, and card overlays fully operable; Esc closes overlay.
- [ ] `prefers-reduced-motion` honored; AA contrast in both themes; usable at 640px width.

## 10. Out of scope (v1)

Drag-and-drop card moves, editing cards from the UI, websocket live updates, auth,
dark/light variants beyond the two themes, burndown charts.
