# Role Registry

Roles are minted, reused, and evolved by the Manager at runtime. Only the Manager writes this
file. IDs (`R-##`) are stable and never reused; retired roles stay for archive traceability.

<!-- Roles are appended below by the Manager, newest last. Example shape:

## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |
    zod for validation; error envelope in src/api/errors.ts; money in integer minor units.
- default-tools: standard
- status: active
- minted: 2026-07-25 by Manager (init)
- history: 0 cards completed, 0 rework
-->
