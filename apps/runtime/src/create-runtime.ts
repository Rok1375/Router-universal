import { resolve } from "node:path";
import type { CapabilityManifest } from "../../../packages/contracts/src/index.js";
import { CapabilityManifestSchema } from "../../../packages/contracts/src/index.js";
import {
  CapabilityRegistry,
  FileCheckpointStore,
  FileImprovementStore,
  ImprovementProposer,
  type PermissionMode,
  PermissionPolicy,
  RouterEventBus,
  RuleBasedTaskAnalyzer,
  UniversalRouter,
} from "../../../packages/core/src/index.js";
import {
  AdapterRegistry,
  createAdapterFromManifest,
  defineInMemoryAdapter,
} from "../../../packages/sdk/src/index.js";

const ECHO_MANIFEST: CapabilityManifest = CapabilityManifestSchema.parse({
  id: "router.echo",
  name: "Router Echo",
  version: "1.0.0",
  kind: "tool",
  description: "Explains, inspects, and demonstrates routed tasks without changing files.",
  tags: ["general", "orchestration", "inspection"],
  intents: ["general-assistance", "understand-subject"],
  permissions: ["filesystem:read"],
  trustLevel: "local",
  endpoint: { transport: "in-memory" },
  enabled: true,
  priority: 2,
  costHint: "low",
});

const VERIFIER_MANIFEST: CapabilityManifest = CapabilityManifestSchema.parse({
  id: "router.verifier",
  name: "Evidence Verifier",
  version: "1.0.0",
  kind: "tool",
  description: "Reviews execution evidence against explicit acceptance criteria.",
  tags: ["verification", "review", "quality"],
  intents: ["review-work"],
  permissions: ["filesystem:read"],
  trustLevel: "local",
  endpoint: { transport: "in-memory" },
  enabled: true,
  priority: 3,
  costHint: "low",
});

function permissionMode(value: string | undefined): PermissionMode {
  return value === "balanced" || value === "developer" ? value : "strict";
}

function numberSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RuntimeOptions {
  capabilityDirectory?: string;
  stateDirectory?: string;
  permissionMode?: PermissionMode;
  allowRemoteCapabilities?: boolean;
  maxContextTokens?: number;
}

export async function createRuntime(options: RuntimeOptions = {}) {
  const registry = new CapabilityRegistry();
  const capabilityDirectory = resolve(
    options.capabilityDirectory ?? process.env.NOVA_CAPABILITY_DIR ?? "./config/capabilities",
  );
  const stateDirectory = resolve(
    options.stateDirectory ?? process.env.NOVA_STATE_DIR ?? "./.nova/state",
  );
  const discovery = await registry.discover(capabilityDirectory);

  if (!registry.get(ECHO_MANIFEST.id)) registry.register(ECHO_MANIFEST);
  if (!registry.get(VERIFIER_MANIFEST.id)) registry.register(VERIFIER_MANIFEST);

  const adapters = new AdapterRegistry();
  for (const manifest of registry.list({ enabledOnly: true })) {
    if (manifest.id === ECHO_MANIFEST.id) {
      adapters.register(
        defineInMemoryAdapter(manifest, async (context) => ({
          status: "succeeded",
          summary: `Understood ${context.understanding.intent} and executed the local inspection adapter.`,
          output: {
            step: context.step.id,
            domains: context.understanding.domains,
            contextItems: context.context.map((item) => item.uri),
          },
          evidence: [`adapter:${manifest.id}`, `step:${context.step.id}`],
          metrics: { contextItems: context.context.length },
          retryable: false,
        })),
      );
      continue;
    }
    if (manifest.id === VERIFIER_MANIFEST.id) {
      adapters.register(
        defineInMemoryAdapter(manifest, async (context) => ({
          status: "succeeded",
          summary: "Acceptance criteria were presented to the verifier adapter.",
          output: { criteria: context.step.verification },
          evidence: context.step.verification.map((criterion) => `criterion-reviewed:${criterion}`),
          metrics: { criteria: context.step.verification.length },
          retryable: false,
        })),
      );
      continue;
    }
    const adapter = createAdapterFromManifest(manifest, {
      allowRemote:
        options.allowRemoteCapabilities ?? process.env.NOVA_ALLOW_REMOTE_CAPABILITIES === "true",
    });
    if (adapter) adapters.register(adapter);
  }

  const events = new RouterEventBus();
  if (process.env.NOVA_LOG_EVENTS === "true") {
    events.subscribe((event) => console.log(JSON.stringify(event)));
  }

  const router = new UniversalRouter({
    analyzer: new RuleBasedTaskAnalyzer(),
    registry,
    policy: PermissionPolicy.fromMode(
      options.permissionMode ?? permissionMode(process.env.NOVA_PERMISSION_MODE),
    ),
    adapters: adapters.asMap(),
    checkpoints: new FileCheckpointStore(stateDirectory),
    events,
    improvementProposer: new ImprovementProposer(),
    improvements: new FileImprovementStore(resolve(stateDirectory, "..", "proposals")),
    maxContextTokens:
      options.maxContextTokens ?? numberSetting(process.env.NOVA_MAX_CONTEXT_TOKENS, 24_000),
    maxRetries: 1,
  });

  return { router, registry, adapters, events, discovery, capabilityDirectory, stateDirectory };
}
