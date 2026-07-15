import { spawn } from "node:child_process";
import type {
  CapabilityAdapter,
  CapabilityExecutionContext,
  CapabilityExecutionResult,
  CapabilityManifest,
} from "../../contracts/src/index.js";
import { CapabilityExecutionResultSchema } from "../../contracts/src/index.js";
import { RouterError } from "../../core/src/errors.js";

export class AdapterRegistry {
  private readonly adapters = new Map<string, CapabilityAdapter>();

  register(adapter: CapabilityAdapter): void {
    if (adapter.manifest.id !== adapter.manifest.id.trim()) {
      throw new RouterError("INVALID_ADAPTER", "Adapter manifest ID contains surrounding whitespace.");
    }
    this.adapters.set(adapter.manifest.id, adapter);
  }

  get(id: string): CapabilityAdapter | undefined {
    return this.adapters.get(id);
  }

  asMap(): Map<string, CapabilityAdapter> {
    return new Map(this.adapters);
  }
}

export function defineInMemoryAdapter(
  manifest: CapabilityManifest,
  handler: (context: CapabilityExecutionContext) => Promise<CapabilityExecutionResult>,
): CapabilityAdapter {
  return { manifest, execute: handler, health: async () => ({ ok: true }) };
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

export class HttpJsonAdapter implements CapabilityAdapter {
  constructor(
    readonly manifest: CapabilityManifest,
    private readonly allowRemote = false,
  ) {
    if (manifest.endpoint.transport !== "http") {
      throw new RouterError("INVALID_ADAPTER", "HTTP adapter requires an HTTP endpoint.");
    }
    const url = new URL(manifest.endpoint.url);
    if (!allowRemote && !isLoopback(url)) {
      throw new RouterError("REMOTE_DISABLED", `Remote capability is disabled: ${url.origin}`);
    }
  }

  async execute(context: CapabilityExecutionContext): Promise<CapabilityExecutionResult> {
    if (this.manifest.endpoint.transport !== "http") throw new RouterError("INVALID_ADAPTER", "Endpoint changed.");
    const timeout = AbortSignal.timeout(this.manifest.endpoint.timeoutMs);
    const response = await fetch(this.manifest.endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...context, signal: undefined }),
      signal: AbortSignal.any([context.signal, timeout]),
    });
    if (!response.ok) {
      throw new RouterError("CAPABILITY_HTTP_ERROR", `Capability returned HTTP ${response.status}.`);
    }
    return CapabilityExecutionResultSchema.parse(await response.json());
  }
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "Path", "SystemRoot", "HOME", "USERPROFILE", "TEMP", "TMP"];
  return Object.fromEntries(allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
}

export class StdioJsonAdapter implements CapabilityAdapter {
  constructor(readonly manifest: CapabilityManifest) {
    if (manifest.endpoint.transport !== "stdio") {
      throw new RouterError("INVALID_ADAPTER", "Stdio adapter requires a stdio endpoint.");
    }
  }

  async execute(context: CapabilityExecutionContext): Promise<CapabilityExecutionResult> {
    if (this.manifest.endpoint.transport !== "stdio") throw new RouterError("INVALID_ADAPTER", "Endpoint changed.");
    const endpoint = this.manifest.endpoint;
    return await new Promise((resolve, reject) => {
      const child = spawn(endpoint.command, endpoint.args, {
        cwd: context.workspace,
        env: safeEnvironment(),
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill(), endpoint.timeoutMs);
      const cancel = () => child.kill();
      context.signal.addEventListener("abort", cancel, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 1_000_000) child.kill();
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 1_000_000) child.kill();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        context.signal.removeEventListener("abort", cancel);
        if (code !== 0) {
          reject(new RouterError("CAPABILITY_PROCESS_ERROR", stderr.trim() || `Process exited with ${code}.`));
          return;
        }
        try {
          resolve(CapabilityExecutionResultSchema.parse(JSON.parse(stdout)));
        } catch (error) {
          reject(new RouterError("CAPABILITY_PROTOCOL_ERROR", error instanceof Error ? error.message : String(error)));
        }
      });
      child.stdin.end(JSON.stringify({ ...context, signal: undefined }));
    });
  }
}

export function createAdapterFromManifest(
  manifest: CapabilityManifest,
  options: { allowRemote?: boolean } = {},
): CapabilityAdapter | undefined {
  if (manifest.endpoint.transport === "http") return new HttpJsonAdapter(manifest, options.allowRemote ?? false);
  if (manifest.endpoint.transport === "stdio") return new StdioJsonAdapter(manifest);
  if (manifest.endpoint.transport === "mcp") return undefined;
  return undefined;
}
