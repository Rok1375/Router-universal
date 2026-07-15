# ADR 0001: Local-first modular core

- **Status:** accepted
- **Date:** 2026-07-15

## Context

The router must serve desktop assistants, coding agents, VS Code, and future cloud clients without
binding the project to one vendor or granting broad computer access.

## Decision

Use a local-first TypeScript core with stable schemas, manifest-driven capabilities, adapter-based
execution, per-step permission policy, loopback networking by default, and human-approved improvement
proposals. Keep the deterministic analyzer as a runnable baseline and make model intelligence
replaceable.

## Consequences

The system works offline and remains testable. Integrations require explicit adapters. Some advanced
features arrive later, but the security and replacement boundaries are correct from the beginning.
