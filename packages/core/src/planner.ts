import { randomUUID } from "node:crypto";
import type {
  CapabilityManifest,
  CostHint,
  ExecutionPlan,
  ExecutionStep,
  Permission,
  RouteSelection,
  TaskUnderstanding,
} from "../../contracts/src/index.js";

const COST_RANK: Record<CostHint, number> = { low: 0, medium: 1, high: 2 };

function costRank(value: CostHint): number {
  return COST_RANK[value];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class RoutePlanner {
  build(
    understanding: TaskUnderstanding,
    selection: RouteSelection,
    manifests: CapabilityManifest[],
    contextBudget: number,
  ): ExecutionPlan {
    const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    const steps: ExecutionStep[] = [];

    for (const [index, capabilityId] of selection.selectedCapabilityIds.entries()) {
      const manifest = byId.get(capabilityId);
      if (!manifest) continue;
      const previous = steps.at(-1);
      const isVerifier =
        manifest.tags.includes("verification") || manifest.intents.includes("review-work");
      const taskPermissions: Permission[] = isVerifier ? [] : understanding.requiredPermissions;
      steps.push({
        id: `step-${index + 1}-${capabilityId.replace(/[^a-z0-9-]/gi, "-")}`,
        title: `${isVerifier ? "Verify with" : "Execute with"} ${manifest.name}`,
        capabilityId,
        input: { intent: understanding.intent, summary: understanding.summary },
        dependsOn: previous ? [previous.id] : [],
        requiredPermissions: unique([...manifest.permissions, ...taskPermissions]),
        verification: isVerifier ? understanding.acceptanceCriteria : [],
      });
    }

    if (
      understanding.writeIntent &&
      steps.length > 0 &&
      !steps.some((step) => step.verification.length > 0)
    ) {
      const finalStep = steps.at(-1);
      if (finalStep) finalStep.verification = understanding.acceptanceCriteria;
    }

    const highestCost =
      manifests
        .filter((manifest) => selection.selectedCapabilityIds.includes(manifest.id))
        .map((manifest) => manifest.costHint)
        .sort((a, b) => costRank(b) - costRank(a))[0] ?? "low";

    return {
      id: randomUUID(),
      taskId: understanding.taskId,
      createdAt: new Date().toISOString(),
      steps,
      estimatedCost: highestCost,
      contextBudget,
      requiresApproval: false,
      explanation:
        steps.length === 0
          ? "No executable plan could be produced from the installed capability catalog."
          : `Selected ${steps.length} capability step${steps.length === 1 ? "" : "s"} using minimal-fit routing.`,
    };
  }
}
