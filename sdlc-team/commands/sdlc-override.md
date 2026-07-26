---
description: Human override of methodology or a config value; the Manager restructures phase metadata and logs the decision.
argument-hint: <methodology | key=value>
---

Argument `$1`: either a methodology (`rad | waterfall`) or a `key=value` config change (e.g. `parallelism=5`).

Invoke the `manager` agent to:
1. Apply the change to `.sdlc/project-config.md`.
2. If the methodology changed, restructure the board header's phase/sprint metadata in `kanban.md` accordingly (rad → increment cycles, waterfall → phase list).
3. Append the change to the Decision Log in `project-config.md` with today's date.
