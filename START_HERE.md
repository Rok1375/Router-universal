# Start here

Router Universal is a local-first, universal task router. Before changing code, read:

1. `docs/constitution.md`
2. `docs/project-state.md`
3. `docs/architecture.md`
4. `docs/security-and-permissions.md`
5. The matching file in `prompts/milestones/`

## Required engineering loop

1. **Understand** the executable outcome, constraints, acceptance criteria, risk, and ambiguity.
2. **Inspect** existing code, configuration, tests, and repository instructions.
3. **Discover** reusable capabilities before inventing new ones.
4. **Plan** a bounded change with explicit verification.
5. **Implement** only the current milestone.
6. **Verify** with lint, typecheck, tests, build, and targeted runtime checks.
7. **Critique** security, complexity, failure recovery, and architectural fit.
8. **Document** changed behavior and project state.

## First local run

```bash
npm install
npm run validate
npm run nova -- capabilities
npm run nova -- preview "Create a React project and verify the build"
```

Do not enable remote endpoints, destructive permissions, secret access, or self-editing behavior as
part of setup. Those require explicit design and human authorization.
