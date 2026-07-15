#!/usr/bin/env node
import { createRuntime } from "../../runtime/src/create-runtime.js";

function valueAfter(prefix: string, args: string[]): string | undefined {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function taskText(args: string[]): string {
  return args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  const runtime = await createRuntime();

  if (command === "health") {
    print({
      ok: true,
      capabilities: runtime.registry.list({ enabledOnly: true }).length,
      discovery: runtime.discovery,
    });
    return;
  }

  if (command === "capabilities") {
    print(runtime.registry.list());
    return;
  }

  if (command === "validate") {
    const missingAdapters = runtime.registry
      .list({ enabledOnly: true })
      .filter((manifest) => manifest.endpoint.transport !== "mcp" && !runtime.adapters.get(manifest.id))
      .map((manifest) => manifest.id);
    print({
      valid: runtime.discovery.issues.length === 0 && missingAdapters.length === 0,
      discovery: runtime.discovery,
      missingAdapters,
    });
    process.exitCode = missingAdapters.length === 0 ? 0 : 1;
    return;
  }

  if (command === "preview" || command === "run") {
    const prompt = taskText(args);
    if (!prompt) throw new Error(`Usage: npm run nova -- ${command} "task" [--dry-run] [--approve=a,b]`);
    const workspace = valueAfter("--workspace=", args);
    const approvals = (valueAfter("--approve=", args) ?? "").split(",").filter(Boolean);
    const task = {
      prompt,
      ...(workspace ? { workspace } : {}),
      context: [],
      constraints: [],
      preferredCapabilities: [],
      deniedCapabilities: [],
      dryRun: args.includes("--dry-run"),
      metadata: { client: "cli" },
    };
    print(command === "preview" ? await runtime.router.preview(task, approvals) : await runtime.router.run(task, approvals));
    return;
  }

  process.stdout.write(`Router Universal CLI\n\nCommands:\n  health\n  capabilities\n  validate\n  preview "task"\n  run "task" [--dry-run] [--approve=permission]\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
