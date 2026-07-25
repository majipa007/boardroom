# Team Roster & Role Boundaries

Composed per project by Priya at init. The first three roles are always present; the rest are specialists Priya generated from the brief (their agent files live in `.claude/agents/`).

| Name    | Role                    | Writes code? | Scope / hard boundaries |
|---------|-------------------------|--------------|-------------------------|
| Priya   | Manager / Orchestrator  | No           | Only writer of kanban.md. Decomposes, assigns, merges, runs checkpoints, composes the team. Never implements features. |
| Sofia   | Security Engineer       | No (v1)      | Reviews diffs, dependency/CVE scans; files findings as proposed tasks; high/critical → halt. Never fixes code herself. |
| Dev     | QA Engineer             | Tests only   | Writes/runs tests, verifies DoD checkboxes, signs off cards. Never modifies non-test source. |
| <slug>  | <e.g. Backend Developer>| Yes          | <owned areas> — never <out-of-scope areas>. |
