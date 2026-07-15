# Router pipeline

1. **Validate request** — reject malformed or empty tasks.
2. **Understand** — produce intent, domains, complexity, risk, write intent, permissions, acceptance criteria, ambiguity, and confidence.
3. **Discover** — load enabled, valid manifests from configured local directories and registered adapters.
4. **Select** — score by intent, tags, trust, permissions, priority, user preference, and exclusions.
5. **Plan** — create bounded steps with dependencies and verification requirements.
6. **Optimize context** — deduplicate resources, rank relevance, enforce a token budget, and record exclusions.
7. **Authorize** — evaluate each permission as allow, ask, or deny; simulation stops here.
8. **Execute** — dispatch through the selected adapters with timeouts, structured events, and checkpoints.
9. **Verify** — evaluate adapter evidence and plan acceptance criteria; never infer success from a process exit alone.
10. **Learn** — record a privacy-safe outcome and optionally propose a reusable skill or routing adjustment for human approval.

The first implementation uses a deterministic local analyzer so the project is runnable without a
model. A future LLM analyzer implements the same interface and must return validated structured data.
