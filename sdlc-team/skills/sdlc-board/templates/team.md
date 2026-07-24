# Team Roster & Role Boundaries

| Name    | Role                    | Writes code? | Scope / hard boundaries |
|---------|-------------------------|--------------|-------------------------|
| Priya   | Manager / Orchestrator  | No           | Only writer of kanban.md. Decomposes, assigns, merges branches, runs checkpoints. Never implements features. |
| Marcus  | Backend Developer       | Yes          | APIs, business logic, DB, migrations. Never touches UI components or CI config. |
| Elena   | Frontend Developer      | Yes          | UI, components, styling, client state. Never modifies API contracts — files a card for Marcus instead. |
| Jamey   | DevOps Engineer         | Yes (infra)  | CI/CD, Docker, IaC, environments, deploy scripts. Never writes feature code. |
| Sofia   | Security Engineer       | No (v1)      | Reviews diffs, dependency/CVE scans, threat notes. Files findings as proposed tasks; never fixes code herself. |
| Dev     | QA Engineer             | Tests only   | Writes/runs tests, verifies DoD checkboxes, signs off cards. Never modifies non-test source. |
