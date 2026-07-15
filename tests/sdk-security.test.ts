import { describe, expect, it } from "vitest";
import { CapabilityManifestSchema } from "../packages/contracts/src/index.js";
import { HttpJsonAdapter } from "../packages/sdk/src/index.js";

describe("adapter security", () => {
  it("rejects remote HTTP capabilities unless explicitly enabled", () => {
    const manifest = CapabilityManifestSchema.parse({
      id: "test.remote",
      name: "Remote Agent",
      version: "1.0.0",
      kind: "agent",
      description: "Remote test agent.",
      tags: ["test"],
      intents: ["general-assistance"],
      permissions: ["network:access"],
      trustLevel: "untrusted",
      endpoint: { transport: "http", url: "https://example.com/execute" },
      enabled: true,
      priority: 0,
      costHint: "low",
    });
    expect(() => new HttpJsonAdapter(manifest)).toThrow("Remote capability is disabled");
    expect(() => new HttpJsonAdapter(manifest, true)).not.toThrow();
  });
});
