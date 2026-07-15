import { describe, expect, it } from "vitest";
import { CapabilityManifestSchema, TaskRequestSchema } from "../packages/contracts/src/index.js";
import { PermissionPolicy } from "../packages/core/src/policy.js";
import { CapabilityRegistry } from "../packages/core/src/registry.js";
import { RuleBasedTaskAnalyzer } from "../packages/core/src/understanding.js";

describe("routing selection and policy", () => {
  const builder = CapabilityManifestSchema.parse({
    id: "test.react-builder",
    name: "React Builder",
    version: "1.0.0",
    kind: "agent",
    description: "Builds React frontend projects and runs tests.",
    tags: ["frontend", "coding", "react"],
    intents: ["build-artifact"],
    permissions: ["filesystem:read", "filesystem:write", "process:run"],
    trustLevel: "verified",
    endpoint: { transport: "in-memory" },
    enabled: true,
    priority: 5,
    costHint: "medium",
  });

  it("selects the strongest matching capability", async () => {
    const registry = new CapabilityRegistry();
    registry.register(builder);
    const request = TaskRequestSchema.parse({ prompt: "Build a React frontend project" });
    const understanding = await new RuleBasedTaskAnalyzer().analyze(request);
    expect(registry.select(request, understanding).selectedCapabilityIds[0]).toBe(builder.id);
  });

  it("does not route based on trust or priority without task relevance", async () => {
    const registry = new CapabilityRegistry();
    registry.register(builder);
    const request = TaskRequestSchema.parse({ prompt: "Translate this paragraph into French" });
    const understanding = await new RuleBasedTaskAnalyzer().analyze(request);
    expect(registry.select(request, understanding).selectedCapabilityIds).toEqual([]);
  });

  it("ignores stopword-only overlap when selecting capabilities", async () => {
    const registry = new CapabilityRegistry();
    registry.register(
      CapabilityManifestSchema.parse({
        id: "test.unrelated",
        name: "Unrelated Helper",
        version: "1.0.0",
        kind: "tool",
        description: "Explains this and that for a user.",
        tags: ["general"],
        intents: ["understand-subject"],
        permissions: ["filesystem:read"],
        trustLevel: "local",
        endpoint: { transport: "in-memory" },
        enabled: true,
        priority: 10,
        costHint: "low",
      }),
    );
    const request = TaskRequestSchema.parse({
      prompt: "Create a React project and verify the build",
    });
    const understanding = await new RuleBasedTaskAnalyzer().analyze(request);
    expect(registry.select(request, understanding).selectedCapabilityIds).toEqual([]);
  });

  it("keeps secret and destructive permissions denied", () => {
    const evaluation = PermissionPolicy.fromMode("developer").evaluate(
      builder,
      ["filesystem:write", "process:run", "secrets:read", "destructive"],
      [],
    );
    expect(evaluation.denied).toEqual(
      expect.arrayContaining([`${builder.id}:secrets:read`, `${builder.id}:destructive`]),
    );
  });
});
