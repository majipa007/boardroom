---
description: One-line-per-agent standup synthesized from the board and recent archive.
---

Read `.sdlc/team.md` (the role registry), `.sdlc/kanban.md`, and the recent `.sdlc/archive/`
messages. Modify nothing.

For each **active role** in the registry, print exactly one line — what it last finished and
what it is starting next, e.g. `R-01 backend: finished T-014, starting T-016.` If a role has
no recent activity, print `R-## <name>: idle.` Retired roles are omitted.

If the project still uses the legacy roster format (a markdown table rather than `R-##`
sections), fall back to one line per listed member.
