# Project Config
- project: <name>
- created: <date>
- methodology: agile            # chosen by model, human-overridable
- methodology-reasoning: |
    <the Manager's written justification>
- sprint-length: 1 round-batch  # or waterfall phase list
- max-rounds-per-sprint: 20
- parallelism: 3                # max workers spawned concurrently per round
- human-checkpoints:
    - init-approval: required
    - sprint-or-phase-gate: required
    - security-high-severity: halt-immediately
    - blocked-escalation: after 2 rounds unresolved

## Decision Log
- <date> methodology=agile approved by human
