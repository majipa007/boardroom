---
description: Launch the read-only SDLC monitoring dashboard on localhost and print its URL.
argument-hint: "[--port N] [--root DIR]"
---

Start the dashboard web server (Node.js ≥ 18 required) and tell the user the URL.

Run this, forwarding any arguments the user passed (default port 8787):

`node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.js" $ARGUMENTS`

The server prints `http://localhost:<port>`. Open it in a browser: it lists every known SDLC project (most-recently-active first) and, per project, shows the composed team, the live kanban board, and a recent-activity feed drawn from the archive — polling every 5 seconds. A header toggle switches between the **Sprint Wall** and **Blueprint** themes, and the choice is remembered. It is **read-only** and never modifies any project.

Notes:
- The server runs until stopped with Ctrl-C. If you need the session free while it runs, start it in the background (append `&`) and report the URL.
- Projects appear automatically if they were created with `/sdlc-init` (which registers them). To include projects created elsewhere, pass `--root <workspace-dir>` to scan for `.sdlc/` folders.
