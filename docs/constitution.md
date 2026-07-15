# Project constitution

These rules are the stable core of Router Universal.

1. **Local first.** The default deployment binds to loopback and works without a cloud control plane.
2. **Framework agnostic.** OpenClaw, Hermes, VS Code, CLIs, desktop apps, and future clients use the same contracts.
3. **Capabilities are data.** Skills, agents, MCP servers, plugins, and tools declare validated manifests.
4. **Adapters isolate integration details.** Core routing never depends on a specific agent vendor or extension.
5. **Least privilege.** Discovery never grants execution permission. Secrets and destructive actions are denied by default.
6. **Understand before acting.** Every meaningful task receives an explicit intent, scope, risk, and acceptance criteria.
7. **Reuse before create.** Select the smallest sufficient capability set and avoid duplicate tools or context.
8. **Explain decisions.** Route previews report selections, confidence, unmet needs, permissions, and planned verification.
9. **Recover by design.** Runs are checkpointed and can resume without repeating completed work.
10. **Verify every write.** File-changing and high-risk tasks require executable validation and honest failure reporting.
11. **Privacy-safe observability.** Logs contain identifiers, timings, decisions, and statuses—not full prompts, code, or secrets.
12. **Human-approved improvement.** The system may propose new skills or policy changes but never silently rewrites itself.
13. **Core stays small.** Product-specific behavior belongs in manifests, adapters, policies, or plugins.
14. **Configuration over forks.** Users should add or swap agents without modifying the router engine.
15. **No false completion.** A result is complete only when acceptance criteria and validation evidence agree.
