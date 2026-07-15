import { randomUUID } from "node:crypto";
import type {
  CapabilityAdapter,
  PermissionDecision,
  RouteSelection,
  TaskRequest,
  TaskRun,
  TaskUnderstanding,
} from "../../contracts/src/index.js";
import {
  CapabilityExecutionResultSchema,
  TaskRequestSchema,
  TaskRunSchema,
} from "../../contracts/src/index.js";
import type { CheckpointStore } from "./checkpoint.js";
import { errorMessage, RouterError } from "./errors.js";
import type { RouterEventBus } from "./events.js";
import type { ImprovementProposer, ImprovementStore } from "./improvement.js";
import type { OptimizedContext } from "./optimizer.js";
import { ContextOptimizer } from "./optimizer.js";
import type { PolicyEvaluation } from "./policy.js";
import { PermissionPolicy } from "./policy.js";
import { RoutePlanner } from "./planner.js";
import { CapabilityRegistry } from "./registry.js";
import type { TaskAnalyzer } from "./understanding.js";

export interface RoutePreview {
  request: TaskRequest;
  understanding: TaskUnderstanding;
  selection: RouteSelection;
  context: OptimizedContext;
  policy: Record<string, PolicyEvaluation>;
  plan: TaskRun["plan"];
}

export interface RouterOptions {
  analyzer: TaskAnalyzer;
  registry: CapabilityRegistry;
  policy: PermissionPolicy;
  adapters: Map<string, CapabilityAdapter>;
  checkpoints: CheckpointStore;
  events: RouterEventBus;
  improvementProposer: ImprovementProposer;
  improvements: ImprovementStore;
  maxContextTokens?: number;
  maxRetries?: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export class UniversalRouter {
  private readonly optimizer = new ContextOptimizer();
  private readonly planner = new RoutePlanner();
  private readonly maxContextTokens: number;
  private readonly maxRetries: number;

  constructor(private readonly options: RouterOptions) {
    this.maxContextTokens = options.maxContextTokens ?? 24_000;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async preview(input: unknown, approvals: string[] = []): Promise<RoutePreview> {
    const request = TaskRequestSchema.parse(input);
    const understanding = await this.options.analyzer.analyze(request);
    const selection = this.options.registry.select(request, understanding);
    const manifests = this.options.registry.list({ enabledOnly: true });
    const context = this.optimizer.optimize(request, understanding, this.maxContextTokens);
    const plan = this.planner.build(understanding, selection, manifests, this.maxContextTokens);
    const policy: Record<string, PolicyEvaluation> = {};

    for (const step of plan.steps) {
      const manifest = this.options.registry.get(step.capabilityId);
      if (!manifest) continue;
      policy[step.id] = this.options.policy.evaluate(manifest, step.requiredPermissions, approvals);
    }
    plan.requiresApproval = Object.values(policy).some((evaluation) => evaluation.pendingApprovals.length > 0);

    this.options.events.emit({
      type: "route.created",
      at: new Date().toISOString(),
      taskId: understanding.taskId,
      data: {
        intent: understanding.intent,
        complexity: understanding.complexity,
        selected: selection.selectedCapabilityIds,
        confidence: understanding.confidence,
      },
    });

    return { request, understanding, selection, context, policy, plan };
  }

  async run(input: unknown, approvals: string[] = []): Promise<TaskRun> {
    const preview = await this.preview(input, approvals);
    const now = new Date().toISOString();
    const run: TaskRun = {
      id: randomUUID(),
      taskId: preview.understanding.taskId,
      requestSummary: preview.understanding.summary,
      understanding: preview.understanding,
      plan: preview.plan,
      status: "created",
      results: [],
      pendingApprovals: unique(
        Object.values(preview.policy).flatMap((evaluation) => evaluation.pendingApprovals),
      ),
      createdAt: now,
      updatedAt: now,
    };

    const denied = unique(Object.values(preview.policy).flatMap((evaluation) => evaluation.denied));
    if (denied.length > 0) {
      run.status = "blocked";
      run.error = `Denied permissions: ${denied.join(", ")}`;
      return this.finish(run);
    }
    if (preview.request.dryRun) {
      run.status = "simulated";
      return this.finish(run);
    }
    if (run.plan.steps.length === 0) {
      run.status = "blocked";
      run.error = preview.selection.unmetRequirements.join(" ") || "No executable steps were planned.";
      return this.finish(run);
    }
    if (run.pendingApprovals.length > 0) {
      run.status = "awaiting_approval";
      return this.finish(run);
    }

    run.status = "running";
    await this.save(run);

    for (const step of run.plan.steps) {
      const adapter = this.options.adapters.get(step.capabilityId);
      if (!adapter) {
        run.status = "failed";
        run.error = `No adapter is registered for capability ${step.capabilityId}.`;
        return this.finish(run);
      }

      let completed = false;
      for (let attempt = 1; attempt <= this.maxRetries + 1 && !completed; attempt += 1) {
        const startedAt = new Date().toISOString();
        this.options.events.emit({
          type: "step.started",
          at: startedAt,
          taskId: run.taskId,
          runId: run.id,
          data: { stepId: step.id, capabilityId: step.capabilityId, attempt },
        });

        try {
          const controller = new AbortController();
          const raw = await adapter.execute({
            task: preview.request,
            understanding: preview.understanding,
            plan: preview.plan,
            step,
            context: preview.context.included,
            ...(preview.request.workspace ? { workspace: preview.request.workspace } : {}),
            signal: controller.signal,
          });
          let result = CapabilityExecutionResultSchema.parse(raw);
          if (result.status === "succeeded" && step.verification.length > 0 && result.evidence.length === 0) {
            result = {
              status: "failed",
              summary: "Capability reported success without required verification evidence.",
              evidence: [],
              metrics: result.metrics,
              retryable: false,
            };
          }
          run.results.push({
            stepId: step.id,
            capabilityId: step.capabilityId,
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            result,
          });
          completed = result.status === "succeeded";
          if (!completed && (!result.retryable || attempt > this.maxRetries)) {
            run.status = result.status === "cancelled" ? "cancelled" : "failed";
            run.error = result.summary;
            return this.finish(run);
          }
        } catch (error) {
          const retryable = attempt <= this.maxRetries;
          run.results.push({
            stepId: step.id,
            capabilityId: step.capabilityId,
            attempt,
            startedAt,
            finishedAt: new Date().toISOString(),
            result: {
              status: "failed",
              summary: errorMessage(error),
              evidence: [],
              metrics: {},
              retryable,
            },
          });
          if (!retryable) {
            run.status = "failed";
            run.error = errorMessage(error);
            return this.finish(run);
          }
        }
        await this.save(run);
      }
    }

    run.status = "succeeded";
    return this.finish(run);
  }

  private async save(run: TaskRun): Promise<void> {
    run.updatedAt = new Date().toISOString();
    TaskRunSchema.parse(run);
    await this.options.checkpoints.save(run);
    this.options.events.emit({
      type: "checkpoint.saved",
      at: run.updatedAt,
      taskId: run.taskId,
      runId: run.id,
      data: { status: run.status, completedSteps: run.results.length },
    });
  }

  private async finish(run: TaskRun): Promise<TaskRun> {
    await this.save(run);
    this.options.events.emit({
      type: "run.status",
      at: run.updatedAt,
      taskId: run.taskId,
      runId: run.id,
      data: { status: run.status, errorClass: run.error ? "execution-error" : "none" },
    });
    const proposal = this.options.improvementProposer.propose(run);
    if (proposal) {
      await this.options.improvements.save(proposal);
      this.options.events.emit({
        type: "improvement.proposed",
        at: proposal.createdAt,
        taskId: run.taskId,
        runId: run.id,
        data: { proposalId: proposal.id, category: proposal.category },
      });
    }
    return TaskRunSchema.parse(run);
  }
}

export function flattenPermissionDecisions(preview: RoutePreview): PermissionDecision[] {
  return Object.values(preview.policy).flatMap((evaluation) => evaluation.decisions);
}

export function assertExecutable(preview: RoutePreview): void {
  if (preview.plan.steps.length === 0) {
    throw new RouterError("NO_ROUTE", "No executable route is available.", {
      unmetRequirements: preview.selection.unmetRequirements,
    });
  }
}
