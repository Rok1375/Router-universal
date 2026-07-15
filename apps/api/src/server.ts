import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z } from "zod";
import { TaskRequestSchema } from "../../../packages/contracts/src/index.js";
import { RouterError } from "../../../packages/core/src/errors.js";
import { createRuntime } from "../../runtime/src/create-runtime.js";

const RunBodySchema = z.object({
  task: TaskRequestSchema,
  approvals: z.array(z.string()).default([]),
});

const RunParamsSchema = z.object({ runId: z.string().uuid() });

export async function buildServer(runtime?: Awaited<ReturnType<typeof createRuntime>>) {
  const activeRuntime = runtime ?? (await createRuntime());
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request, reply) => {
    const token = process.env.NOVA_API_TOKEN;
    if (!token) return;
    if (request.headers.authorization !== `Bearer ${token}`) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "router-universal",
    version: "0.1.0",
    capabilities: activeRuntime.registry.list({ enabledOnly: true }).length,
    discoveryIssues: activeRuntime.discovery.issues.length,
  }));

  app.get("/v1/capabilities", async () => ({
    capabilities: activeRuntime.registry.list(),
    discovery: activeRuntime.discovery,
  }));

  app.post("/v1/routes/preview", async (request, reply) => {
    const task = TaskRequestSchema.safeParse(request.body);
    if (!task.success)
      return reply.code(400).send({ error: "invalid-task", issues: task.error.issues });
    return activeRuntime.router.preview(task.data);
  });

  app.post("/v1/tasks", async (request, reply) => {
    const body = RunBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: "invalid-run", issues: body.error.issues });
    return activeRuntime.router.run(body.data.task, body.data.approvals);
  });
  app.post("/v1/runs/:runId/resume", async (request, reply) => {
    const params = RunParamsSchema.safeParse(request.params);
    const body = RunBodySchema.safeParse(request.body);
    if (!params.success)
      return reply.code(400).send({ error: "invalid-run-id", issues: params.error.issues });
    if (!body.success)
      return reply.code(400).send({ error: "invalid-run", issues: body.error.issues });
    return activeRuntime.router.resume(params.data.runId, body.data.task, body.data.approvals);
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ err: error }, "request failed");
    if (error instanceof RouterError) {
      const statusCode = error.code === "RUN_NOT_FOUND" ? 404 : 409;
      return reply.code(statusCode).send({ error: error.code, message: error.message });
    }
    return reply.code(500).send({ error: "internal-error" });
  });

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  const host = process.env.NOVA_HOST ?? "127.0.0.1";
  const port = Number(process.env.NOVA_PORT ?? 4317);
  await app.listen({ host, port });
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
