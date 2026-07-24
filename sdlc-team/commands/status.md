---
description: Read-only summary of the SDLC board — column counts, blocked items, current phase, recent history.
---

Read `.sdlc/kanban.md` and the most recent files in `.sdlc/archive/`. Do NOT modify anything.

If `.sdlc/kanban.md` does not exist, tell the user to run `/sdlc-init` first and stop.

Otherwise print:
- Project name, methodology, current phase, and round number (from the board header).
- A count of cards in each column: Blocked / Backlog / In Progress / Review / Done.
- Every Blocked card: its id, title, and `question:` line.
- The last 3 archive entries (filename + one-line summary from each message's `## Summary`).
