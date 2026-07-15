import { describe, expect, it, vi } from "vitest";
import { CapabilityManifestSchema } from "../packages/contracts/src/index.js";
import {
  CapabilityRegistry,
  ImprovementProposer,
  InMemoryCheckpointStore,
  InMemoryImprovementStore,
  PermissionPolicy,
  type RouterEvent,
  RouterEventBus,
  RuleBasedTaskAnalyzer,
  UniversalRouter,
} from "../packages/core/src/index.js";
import { defineInMemoryAdapter } from "../packages/sdk/src/index.js";

function fixture(mode: "strict" | "balanced" | "developer" = "developer") {
  const manifest = CapabilityManifestSchema.parse({
    id: "test.builder",
    name: "Test Builder",
    version: "1.0.0",
    kind: "agent",
    description: "Creates coding artifacts and verifies their result.",
    tags: ["coding", "frontend"],
    intents: ["build-artifact"],
    permissions: ["filesystem:read", "filesystem:write"],
    trustLevel: "local",
    endpoint: { transport: "in-memory" },
    enabled: true,
    priority: 10,
    costHint: "low",
  });
  const execute = vi.fn(async () => ({
    status: "succeeded" as const,
    summary: "Created the requested artifact.",
    evidence: ["test:passed"],
    metrics: {},
    retryable: false,
  }));
  const registry = new CapabilityRegistry();
  registry.register(manifest);
  const events = new RouterEventBus();
  const received: RouterEvent[] = [];
  events.subscribe((event) => received.push(event));
  const improvements = new InMemoryImprovementStore();
  const router = new UniversalRouter({
    analyzer: new RuleBasedTaskAnalyzer(),
    registry,
    policy: PermissionPolicy.fromMode(mode),
    adapters: new Map([[manifest.id, defineInMemoryAdapter(manifest, execute)]]),
    checkpoints: new InMemoryCheckpointStore(),
    events,
    improvementProposer: new ImprovementProposer(),
    improvements,
  });
  return { router, execute, received, improvements };
}

describe("UniversalRouter", () => {
  it("previews without execution", async () => {
    const { router, execute } = fixture();
    const preview = await router.preview({ prompt: "Create a frontend component", dryRun: true });
    expect(preview.plan.steps).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("waits for approval without creating an improvement proposal", async () => {
    const { router, improvements } = fixture("strict");
    const run = await router.run({ prompt: "Create a frontend component" });
    expect(run.status).toBe("awaiting_approval");
    expect(run.pendingApprovals.some((value) => value.includes("filesystem:write"))).toBe(true);
    expect(improvements.proposals).toHaveLength(0);
  });

  it("resumes an approval-gated run with the original request fingerprint", async () => {
    const { router, execute } = fixture("strict");
    const task = { prompt: "Create a frontend component" };
    const waiting = await router.run(task);
    const resumed = await router.resume(waiting.id, task, ["filesystem:write"]);
    expect(resumed.status).toBe("succeeded");
    expect(resumed.id).toBe(waiting.id);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects resume input that differs from the original task", async () => {
    const { router } = fixture("strict");
    const waiting = await router.run({ prompt: "Create a frontend component" });
    await expect(
      router.resume(waiting.id, { prompt: "Create a different component" }, ["filesystem:write"]),
    ).rejects.toThrow("does not match the original task fingerprint");
  });

  it("executes, checkpoints, and emits the complete lifecycle", async () => {
    const { router, execute, received } = fixture();
    const run = await router.run({ prompt: "Create a frontend component" });
    expect(run.status).toBe("succeeded");
    expect(run.results[0]?.result.evidence).toContain("test:passed");
    expect(execute).toHaveBeenCalledOnce();
    expect(received.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "permission.decided",
        "route.created",
        "capability.selected",
        "step.started",
        "step.completed",
        "checkpoint.saved",
        "run.status",
      ]),
    );
  });
});
