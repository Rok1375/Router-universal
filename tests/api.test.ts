import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../apps/api/src/server.js";
import { createRuntime } from "../apps/runtime/src/create-runtime.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("API", () => {
  it("reports health, previews a route, and maps missing runs to 404", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "router-universal-"));
    temporary.push(stateDirectory);
    const runtime = await createRuntime({ stateDirectory, permissionMode: "strict" });
    const app = await buildServer(runtime);
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const preview = await app.inject({
      method: "POST",
      url: "/v1/routes/preview",
      payload: { prompt: "Explain the router architecture" },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().selection.selectedCapabilityIds).toContain("router.echo");

    const missingRun = await app.inject({
      method: "POST",
      url: "/v1/runs/00000000-0000-4000-8000-000000000000/resume",
      payload: { task: { prompt: "Explain the router architecture" } },
    });
    expect(missingRun.statusCode).toBe(404);
    expect(missingRun.json().error).toBe("RUN_NOT_FOUND");
    await app.close();
  });
});
