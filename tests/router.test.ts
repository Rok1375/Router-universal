import { describe, expect, it, vi } from "vitest";
import { CapabilityManifestSchema } from "../packages/contracts/src/index.js";
import {
  CapabilityRegistry,
  ImprovementProposer,
  InMemoryCheckpointStore,
  InMemoryImprovementStore,
  PermissionPolicy,
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
  const router = new UniversalRouter({
    analyzer: new RuleBasedTaskAnalyzer(),
    registry,
    policy: PermissionPolicy.fromMode(mode),
    adapters: new Map([[manifest.id, defineInMemoryAdapter(manifest, execute)]]),
    checkpoints: new InMemoryCheckpointStore(),
    events: new RouterEventBus(),
    improvementProposer: new ImprovementProposer(),
    improvements: new InMemoryImprovementStore(),
  });
  return { router, execute };
}

describe("UniversalRouter", () => {
  it("previews without execution", async () => {
    const { router, execute } = fixture();
    const preview = await router.preview({ prompt: "Create a frontend component", dryRun: true });
    expect(preview.plan.steps).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("waits for approval in strict mode", async () => {
    const { router } = fixture("strict");
    const run = await router.run({ prompt: "Create a frontend component" });
    expect(run.status).toBe("awaiting_approval");
    expect(run.pendingApprovals.some((value) => value.includes("filesystem:write"))).toBe(true);
  });

  it("executes and checkpoints an approved route", async () => {
    const { router, execute } = fixture();
    const run = await router.run({ prompt: "Create a frontend component" });
    expect(run.status).toBe("succeeded");
    expect(run.results[0]?.result.evidence).toContain("test:passed");
    expect(execute).toHaveBeenCalledOnce();
  });
});
