# Project Config
- project: <name>
- created: <date>
- methodology: rad               # rad (default) | waterfall (compliance override)
- methodology-reasoning: |
    <the Manager's written justification>
- sprint-length: 1 round-batch  # or waterfall phase list
- max-rounds-per-sprint: 20
- parallelism: 3                # max workers spawned concurrently per round
- max-role-mints-per-sprint: 2   # breach → batched as question(HUMAN) at the next hard stop
- max-active-roles: 4            # breach → consolidate/retire before minting
- autopilot: off                 # on = run rounds continuously, halting only on hard stops
- human-checkpoints:
    - init-approval: required
    - sprint-or-phase-gate: required
    - security-high-severity: halt-immediately
    - blocked-escalation: after 2 rounds unresolved

## Decision Log
- <date> methodology=rad approved by human
