import { describe, expect, it } from "vitest";
import { TaskRequestSchema } from "../packages/contracts/src/index.js";
import { ContextOptimizer } from "../packages/core/src/optimizer.js";
import { RuleBasedTaskAnalyzer } from "../packages/core/src/understanding.js";

describe("ContextOptimizer", () => {
  it("deduplicates resources and enforces the budget", async () => {
    const request = TaskRequestSchema.parse({
      prompt: "Explain the React component",
      context: [
        { id: "a", uri: "file:///a.tsx", content: "export function App() {}", priority: 10 },
        { id: "b", uri: "file:///a.tsx", content: "export function App() {}", priority: 10 },
        { id: "c", uri: "file:///large.txt", content: "x".repeat(1000), priority: -10 },
      ],
    });
    const understanding = await new RuleBasedTaskAnalyzer().analyze(request);
    const result = new ContextOptimizer().optimize(request, understanding, 50);
    expect(result.included.map((item) => item.id)).toEqual(["a"]);
    expect(result.excluded.map((item) => item.reason)).toEqual(expect.arrayContaining(["duplicate", "token-budget"]));
  });
});
