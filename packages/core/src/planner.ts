import { randomUUID } from "node:crypto";
import type {
  CapabilityManifest,
  CostHint,
  ExecutionPlan,
  ExecutionStep,
  RouteSelection,
  TaskUnderstanding,
} from "../../contracts/src/index.js";

const COST_RANK: Record<CostHint, number> = { low: 0, medium: 1, high: 2 };

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
      const isVerifier = manifest.tags.includes("verification") || manifest.intents.includes("review-work");
      steps.push({
        id: `step-${index + 1}-${capabilityId.replace(/[^a-z0-9-]/gi, "-")}`,
        title: `${isVerifier ? "Verify with" : "Execute with"} ${manifest.name}`,
        capabilityId,
        input: { intent: understanding.intent, summary: understanding.summary },
        dependsOn: previous ? [previous.id] : [],
        requiredPermissions: manifest.permissions,
        verification: isVerifier ? understanding.acceptanceCriteria : [],
      });
    }

    const highestCost = manifests
      .filter((manifest) => selection.selectedCapabilityIds.includes(manifest.id))
      .map((manifest) => manifest.costHint)
      .sort((a, b) => COST_RANK[b] - COST_RANK[a])[0] ?? "low";

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
