import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImprovementProposal, TaskRun } from "../../contracts/src/index.js";

export interface ImprovementStore {
  save(proposal: ImprovementProposal): Promise<void>;
}

export class InMemoryImprovementStore implements ImprovementStore {
  readonly proposals: ImprovementProposal[] = [];

  async save(proposal: ImprovementProposal): Promise<void> {
    this.proposals.push(structuredClone(proposal));
  }
}

export class FileImprovementStore implements ImprovementStore {
  constructor(private readonly directory: string) {}

  async save(proposal: ImprovementProposal): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, `${proposal.id}.json`), `${JSON.stringify(proposal, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export class ImprovementProposer {
  propose(run: TaskRun): ImprovementProposal | undefined {
    if (run.status === "succeeded" || run.status === "simulated") return undefined;
    const noSteps = run.plan.steps.length === 0;
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      taskId: run.taskId,
      category: noSteps ? "capability" : "verification",
      title: noSteps ? "Add capability coverage for an unmatched task" : "Investigate a failed routed execution",
      rationale: noSteps
        ? "The local capability catalog could not produce an executable plan."
        : "A routed step failed or could not provide the required verification evidence.",
      evidence: [run.error ?? `run-status:${run.status}`],
      expectedBenefit: "Reduce repeated routing failures while preserving explicit review and tests.",
      risk: "A poorly scoped capability or relaxed verification could reduce safety or routing quality.",
      testPlan: [
        "Reproduce the original failure with a privacy-safe fixture.",
        "Add a focused unit or integration test.",
        "Run npm run validate before approval.",
      ],
      status: "proposed",
    };
  }
}
