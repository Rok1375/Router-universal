# Observability

The core emits structured events for route creation, capability selection, permission decisions,
step start, step completion, checkpoint writes, run completion, and improvement proposals.

Safe fields include IDs, capability names, categories, durations, token estimates, statuses, and
error classes. Unsafe fields include full prompts, source code, credentials, environment values,
private file contents, and raw model transcripts.

The default event bus is in-process. Future sinks may write JSONL, OpenTelemetry spans, or a desktop
activity feed while preserving the same privacy contract.
