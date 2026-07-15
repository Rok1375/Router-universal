import { describe, expect, it } from "vitest";
import { TaskRequestSchema } from "../packages/contracts/src/index.js";
import { RuleBasedTaskAnalyzer } from "../packages/core/src/understanding.js";

describe("RuleBasedTaskAnalyzer", () => {
  it("classifies a software creation request and its permissions", async () => {
    const request = TaskRequestSchema.parse({
      prompt: "Create a React project, verify the build, run tests, and push it to GitHub.",
    });
    const result = await new RuleBasedTaskAnalyzer().analyze(request);
    expect(result.intent).toBe("build-artifact");
    expect(result.domains).toContain("frontend");
    expect(result.requiredPermissions).toEqual(
      expect.arrayContaining([
        "filesystem:read",
        "filesystem:write",
        "process:run",
        "network:access",
      ]),
    );
    expect(result.acceptanceCriteria.length).toBeGreaterThan(1);
  });
});
