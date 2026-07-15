import { createHash, randomUUID } from "node:crypto";
import type {
  CapabilityAdapter,
  ExecutionPlan,
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
import { RoutePlanner } from "./planner.js";
import type { PermissionPolicy, PolicyEvaluation } from "./policy.js";
import type { CapabilityRegistry } from "./registry.js";
import type { TaskAnalyzer } from "./understanding.js";

export interface RoutePreview {
  request: TaskRequest;
  understanding: TaskUnderstanding;
  selection: RouteSelection;
  context: OptimizedContext;
  policy: Record<string, PolicyEvaluation>;
  plan: ExecutionPlan;
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

function fingerprint(request: TaskRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: request.prompt,
        workspace: request.workspace ?? null,
        constraints: request.constraints,
        context: request.context.map((resource) => ({
          id: resource.id,
          uri: resource.uri,
          hash:
            resource.hash ??
            createHash("sha256")
              .update(resource.content ?? "")
              .digest("hex"),
        })),
      }),
    )
    .digest("hex");
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
    const policy = this.evaluatePolicy(plan, approvals, understanding.taskId);
    plan.requiresApproval = Object.values(policy).some(
      (evaluation) => evaluation.pendingApprovals.length > 0,
    );

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

    for (const capabilityId of selection.selectedCapabilityIds) {
      this.options.events.emit({
        type: "capability.selected",
        at: new Date().toISOString(),
        taskId: understanding.taskId,
        data: {
          capabilityId,
          score: selection.scores[capabilityId] ?? 0,
          reasons: selection.reasons[capabilityId] ?? [],
        },
      });
    }

    return { request, understanding, selection, context, policy, plan };
  }

  async run(input: unknown, approvals: string[] = []): Promise<TaskRun> {
    const preview = await this.preview(input, approvals);
    const now = new Date().toISOString();
    const run: TaskRun = {
      id: randomUUID(),
      taskId: preview.understanding.taskId,
      requestFingerprint: fingerprint(preview.request),
      requestSummary: preview.understanding.summary,
      understanding: preview.understanding,
      plan: preview.plan,
      status: "created",
      results: [],
      pendingApprovals: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.gateAndExecute(run, preview.request, preview.context, preview.policy);
  }

  async resume(runId: string, input: unknown, approvals: string[] = []): Promise<TaskRun> {
    const run = await this.options.checkpoints.load(runId);
    if (!run) {
      throw new RouterError("RUN_NOT_FOUND", `Run ${runId} was not found.`);
    }
    if (run.status === "succeeded" || run.status === "simulated") {
      return run;
    }

    const request = TaskRequestSchema.parse(input);
    if (fingerprint(request) !== run.requestFingerprint) {
      throw new RouterError(
        "RESUME_INPUT_MISMATCH",
        "The resume request does not match the original task fingerprint.",
      );
    }

    const context = this.optimizer.optimize(request, run.understanding, run.plan.contextBudget);
    const policy = this.evaluatePolicy(run.plan, approvals, run.taskId, run.id);
    run.plan.requiresApproval = Object.values(policy).some(
      (evaluation) => evaluation.pendingApprovals.length > 0,
    );
    return this.gateAndExecute(run, request, context, policy);
  }

  private evaluatePolicy(
    plan: ExecutionPlan,
    approvals: string[],
    taskId: string,
    runId?: string,
  ): Record<string, PolicyEvaluation> {
    const policy: Record<string, PolicyEvaluation> = {};
    for (const step of plan.steps) {
      const manifest = this.options.registry.get(step.capabilityId);
      if (!manifest) continue;
      const evaluation = this.options.policy.evaluate(
        manifest,
        step.requiredPermissions,
        approvals,
      );
      policy[step.id] = evaluation;
      for (const decision of evaluation.decisions) {
        this.options.events.emit({
          type: "permission.decided",
          at: new Date().toISOString(),
          taskId,
          ...(runId ? { runId } : {}),
          data: {
            capabilityId: decision.capabilityId,
            permission: decision.permission,
            outcome: decision.outcome,
          },
        });
      }
    }
    return policy;
  }

  private async gateAndExecute(
    run: TaskRun,
    request: TaskRequest,
    context: OptimizedContext,
    policy: Record<string, PolicyEvaluation>,
  ): Promise<TaskRun> {
    const denied = unique(Object.values(policy).flatMap((evaluation) => evaluation.denied));
    run.pendingApprovals = unique(
      Object.values(policy).flatMap((evaluation) => evaluation.pendingApprovals),
    );

    if (denied.length > 0) {
      run.status = "blocked";
      run.error = `Denied permissions: ${denied.join(", ")}`;
      return this.finish(run);
    }
    if (request.dryRun) {
      run.status = "simulated";
      delete run.error;
      return this.finish(run);
    }
    if (run.plan.steps.length === 0) {
      run.status = "blocked";
      run.error = "No executable steps were planned.";
      return this.finish(run);
    }
    if (run.pendingApprovals.length > 0) {
      run.status = "awaiting_approval";
      delete run.error;
      return this.finish(run);
    }

    delete run.error;
    return this.execute(run, request, context);
  }

  private async execute(
    run: TaskRun,
    request: TaskRequest,
    context: OptimizedContext,
  ): Promise<TaskRun> {
    run.status = "running";
    await this.save(run);

    const completedStepIds = new Set(
      run.results
        .filter((entry) => entry.result.status === "succeeded")
        .map((entry) => entry.stepId),
    );

    for (const step of run.plan.steps) {
      if (completedStepIds.has(step.id)) continue;
      const adapter = this.options.adapters.get(step.capabilityId);
      if (!adapter) {
        run.status = "failed";
        run.error = `No adapter is registered for capability ${step.capabilityId}.`;
        return this.finish(run);
      }

      const previousAttempts = run.results.filter((entry) => entry.stepId === step.id).length;
      let completed = false;

      for (let retry = 0; retry <= this.maxRetries && !completed; retry += 1) {
        const attempt = previousAttempts + retry + 1;
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
            task: request,
            understanding: run.understanding,
            plan: run.plan,
            step,
            context: context.included,
            ...(request.workspace ? { workspace: request.workspace } : {}),
            signal: controller.signal,
          });
          let result = CapabilityExecutionResultSchema.parse(raw);
          if (
            result.status === "succeeded" &&
            step.verification.length > 0 &&
            result.evidence.length === 0
          ) {
            result = {
              status: "failed",
              summary: "Capability reported success without required verification evidence.",
              evidence: [],
              metrics: result.metrics,
              retryable: false,
            };
          }
          const finishedAt = new Date().toISOString();
          run.results.push({
            stepId: step.id,
            capabilityId: step.capabilityId,
            attempt,
            startedAt,
            finishedAt,
            result,
          });
          this.emitStepCompleted(
            run,
            step.id,
            step.capabilityId,
            startedAt,
            finishedAt,
            result.status,
          );
          completed = result.status === "succeeded";
          if (!completed && (!result.retryable || retry >= this.maxRetries)) {
            run.status = result.status === "cancelled" ? "cancelled" : "failed";
            run.error = result.summary;
            return this.finish(run);
          }
        } catch (error) {
          const retryable = retry < this.maxRetries;
          const finishedAt = new Date().toISOString();
          run.results.push({
            stepId: step.id,
            capabilityId: step.capabilityId,
            attempt,
            startedAt,
            finishedAt,
            result: {
              status: "failed",
              summary: errorMessage(error),
              evidence: [],
              metrics: {},
              retryable,
            },
          });
          this.emitStepCompleted(run, step.id, step.capabilityId, startedAt, finishedAt, "failed");
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

  private emitStepCompleted(
    run: TaskRun,
    stepId: string,
    capabilityId: string,
    startedAt: string,
    finishedAt: string,
    status: string,
  ): void {
    this.options.events.emit({
      type: "step.completed",
      at: finishedAt,
      taskId: run.taskId,
      runId: run.id,
      data: {
        stepId,
        capabilityId,
        status,
        durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      },
    });
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
