# Contributing

1. Read `START_HERE.md`, `docs/constitution.md`, and `docs/project-state.md`.
2. Create a focused branch and keep changes inside one architectural responsibility.
3. Add or update tests before claiming completion.
4. Run `npm run validate`.
5. Update documentation, project state, and an ADR when a durable architectural choice changes.

Do not weaken permission defaults, silently enable remote capabilities, store full prompts in logs,
or add self-modifying behavior. New integrations belong behind the adapter contract in
`packages/contracts/src/index.ts`.
