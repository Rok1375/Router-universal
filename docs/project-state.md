# Project state

**Version:** 0.1.0  
**Status:** production-grade foundation / pre-integration  
**Last updated:** 2026-07-15

## Implemented

- Repository constitution, architecture, security model, roadmap, ADRs, and AI engineering prompts.
- Type-safe contracts and validated capability manifests.
- Deterministic task understanding with a replaceable analyzer interface.
- Local capability discovery, ranking, minimal selection, planning, context budgeting, and policy evaluation.
- In-memory, local HTTP, and fixed-command stdio adapter support.
- Dry-run preview, execution, checkpointing, event emission, and improvement proposals.
- Fastify API, CLI, built-in example capabilities, automated tests, and CI.

## Deliberately not implemented yet

- Direct OpenClaw, OpenHands, Hermes, OpenCode, Kilo, or VS Code extension adapters.
- Dedicated MCP protocol transport.
- Model-backed semantic understanding.
- Desktop UI and voice activation.
- Automatic application of self-improvement proposals.

## Next recommended milestone

Implement the MCP adapter and OpenClaw integration using `prompts/milestones/05-mcp-and-openclaw.md`.
