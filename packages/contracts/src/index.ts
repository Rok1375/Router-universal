import { z } from "zod";

export const PermissionSchema = z.enum([
  "filesystem:read",
  "filesystem:write",
  "process:run",
  "network:access",
  "secrets:read",
  "destructive",
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const ResourceRefSchema = z.object({
  id: z.string().min(1),
  uri: z.string().min(1),
  content: z.string().optional(),
  mediaType: z.string().optional(),
  priority: z.number().int().min(-100).max(100).default(0),
  hash: z.string().optional(),
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;

export const TaskRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  workspace: z.string().optional(),
  context: z.array(ResourceRefSchema).default([]),
  constraints: z.array(z.string()).default([]),
  preferredCapabilities: z.array(z.string()).default([]),
  deniedCapabilities: z.array(z.string()).default([]),
  dryRun: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const ComplexitySchema = z.enum(["trivial", "standard", "complex", "high-risk"]);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const TaskUnderstandingSchema = z.object({
  taskId: z.string().uuid(),
  intent: z.string().min(1),
  summary: z.string().min(1),
  domains: z.array(z.string()),
  complexity: ComplexitySchema,
  risk: z.array(z.string()),
  writeIntent: z.boolean(),
  requiredPermissions: z.array(PermissionSchema),
  acceptanceCriteria: z.array(z.string()),
  ambiguities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type TaskUnderstanding = z.infer<typeof TaskUnderstandingSchema>;

export const CapabilityKindSchema = z.enum(["agent", "skill", "mcp", "plugin", "tool"]);
export const TrustLevelSchema = z.enum(["untrusted", "community", "verified", "local"]);
export const CostHintSchema = z.enum(["low", "medium", "high"]);

export const CapabilityEndpointSchema = z.discriminatedUnion("transport", [
  z.object({ transport: z.literal("in-memory") }),
  z.object({
    transport: z.literal("http"),
    url: z.url(),
    timeoutMs: z.number().int().positive().max(900_000).default(120_000),
  }),
  z.object({
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    timeoutMs: z.number().int().positive().max(900_000).default(120_000),
  }),
  z.object({
    transport: z.literal("mcp"),
    serverId: z.string().min(1),
    tool: z.string().optional(),
  }),
]);
export type CapabilityEndpoint = z.infer<typeof CapabilityEndpointSchema>;

export const CapabilityManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  kind: CapabilityKindSchema,
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  intents: z.array(z.string()).default([]),
  permissions: z.array(PermissionSchema).default([]),
  trustLevel: TrustLevelSchema.default("untrusted"),
  endpoint: CapabilityEndpointSchema,
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-100).max(100).default(0),
  costHint: CostHintSchema.default("medium"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export const RouteSelectionSchema = z.object({
  selectedCapabilityIds: z.array(z.string()),
  reasons: z.record(z.string(), z.array(z.string())),
  scores: z.record(z.string(), z.number()),
  unmetRequirements: z.array(z.string()),
});
export type RouteSelection = z.infer<typeof RouteSelectionSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  capabilityId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  requiredPermissions: z.array(PermissionSchema).default([]),
  verification: z.array(z.string()).default([]),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionPlanSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  createdAt: z.iso.datetime(),
  steps: z.array(ExecutionStepSchema),
  estimatedCost: CostHintSchema,
  contextBudget: z.number().int().positive(),
  requiresApproval: z.boolean(),
  explanation: z.string(),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export const CapabilityExecutionResultSchema = z.object({
  status: z.enum(["succeeded", "failed", "cancelled"]),
  summary: z.string().min(1),
  output: z.unknown().optional(),
  evidence: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.number()).default({}),
  retryable: z.boolean().default(false),
});
export type CapabilityExecutionResult = z.infer<typeof CapabilityExecutionResultSchema>;

export interface CapabilityExecutionContext {
  task: TaskRequest;
  understanding: TaskUnderstanding;
  plan: ExecutionPlan;
  step: ExecutionStep;
  context: ResourceRef[];
  workspace?: string;
  signal: AbortSignal;
}

export interface CapabilityAdapter {
  readonly manifest: CapabilityManifest;
  execute(context: CapabilityExecutionContext): Promise<CapabilityExecutionResult>;
  health?(): Promise<{ ok: boolean; detail?: string }>;
}

export const PermissionOutcomeSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionOutcome = z.infer<typeof PermissionOutcomeSchema>;

export const PermissionDecisionSchema = z.object({
  capabilityId: z.string(),
  permission: PermissionSchema,
  outcome: PermissionOutcomeSchema,
  reason: z.string(),
});
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const RunStatusSchema = z.enum([
  "created",
  "simulated",
  "awaiting_approval",
  "blocked",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const StepResultSchema = z.object({
  stepId: z.string(),
  capabilityId: z.string(),
  attempt: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  result: CapabilityExecutionResultSchema,
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const TaskRunSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  requestSummary: z.string(),
  understanding: TaskUnderstandingSchema,
  plan: ExecutionPlanSchema,
  status: RunStatusSchema,
  results: z.array(StepResultSchema),
  pendingApprovals: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  error: z.string().optional(),
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

export const ImprovementProposalSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.iso.datetime(),
  taskId: z.string().uuid(),
  category: z.enum(["capability", "routing", "context", "policy", "verification"]),
  title: z.string(),
  rationale: z.string(),
  evidence: z.array(z.string()),
  expectedBenefit: z.string(),
  risk: z.string(),
  testPlan: z.array(z.string()),
  status: z.enum(["proposed", "approved", "rejected", "implemented"]),
});
export type ImprovementProposal = z.infer<typeof ImprovementProposalSchema>;
