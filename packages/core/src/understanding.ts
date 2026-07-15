import { randomUUID } from "node:crypto";
import type { Permission, TaskRequest, TaskUnderstanding } from "../../contracts/src/index.js";

export interface TaskAnalyzer {
  analyze(request: TaskRequest): Promise<TaskUnderstanding>;
}

const DOMAIN_PATTERNS: Record<string, RegExp> = {
  frontend: /\b(react|next\.?js|vite|frontend|ui|css|tailwind|component|webgl|three\.?js)\b/i,
  backend: /\b(api|backend|server|database|sql|node|python|service)\b/i,
  coding: /\b(code|project|repository|repo|implement|debug|test|build|compile|typescript|javascript)\b/i,
  browser: /\b(browser|website|page|chrome|playwright|navigate|open)\b/i,
  devops: /\b(deploy|docker|kubernetes|ci|cd|pipeline|cloud|server)\b/i,
  security: /\b(auth|security|secret|credential|permission|vulnerability|token)\b/i,
  git: /\b(git|github|clone|commit|branch|push|pull request|repo)\b/i,
  orchestration: /\b(agent|skill|mcp|plugin|route|orchestrat|delegate|workflow)\b/i,
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function inferIntent(prompt: string): string {
  if (/\b(debug|fix|repair|error|failing|broken)\b/i.test(prompt)) return "debug-software";
  if (/\b(review|audit|double.?check|verify|inspect)\b/i.test(prompt)) return "review-work";
  if (/\b(create|build|implement|scaffold|generate|clone)\b/i.test(prompt)) return "build-artifact";
  if (/\b(deploy|publish|release|push)\b/i.test(prompt)) return "publish-artifact";
  if (/\b(explain|understand|summarize|research)\b/i.test(prompt)) return "understand-subject";
  return "general-assistance";
}

export class RuleBasedTaskAnalyzer implements TaskAnalyzer {
  async analyze(request: TaskRequest): Promise<TaskUnderstanding> {
    const prompt = request.prompt;
    const domains = Object.entries(DOMAIN_PATTERNS)
      .filter(([, pattern]) => pattern.test(prompt))
      .map(([domain]) => domain);
    const intent = inferIntent(prompt);
    const writeIntent = /\b(create|build|write|edit|update|fix|install|clone|commit|push|delete|remove)\b/i.test(
      prompt,
    );
    const permissions: Permission[] = ["filesystem:read"];
    if (writeIntent) permissions.push("filesystem:write");
    if (/\b(run|install|build|test|compile|open|start|launch|clone|git)\b/i.test(prompt)) {
      permissions.push("process:run");
    }
    if (/\b(web|website|github|clone|download|api|network|cloud|deploy|publish)\b/i.test(prompt)) {
      permissions.push("network:access");
    }
    if (/\b(secret|credential|api key|token|password)\b/i.test(prompt)) {
      permissions.push("secrets:read");
    }
    if (/\b(delete|destroy|wipe|reset|force push|drop database)\b/i.test(prompt)) {
      permissions.push("destructive");
    }

    const risk: string[] = [];
    if (permissions.includes("destructive")) risk.push("destructive-action");
    if (permissions.includes("secrets:read")) risk.push("secret-access");
    if (/\b(deploy|publish|production|migration|payment|auth)\b/i.test(prompt)) risk.push("high-impact");
    if (/\b(sudo|administrator|full permission|root)\b/i.test(prompt)) risk.push("elevated-privilege");

    const connectors = (prompt.match(/\b(and then|then|after that|once|also)\b/gi) ?? []).length;
    const complexity =
      risk.length > 0
        ? "high-risk"
        : connectors >= 3 || prompt.length > 600
          ? "complex"
          : prompt.length < 80 && connectors === 0
            ? "trivial"
            : "standard";

    const acceptanceCriteria = ["The requested outcome is produced without violating constraints."];
    if (writeIntent) acceptanceCriteria.push("All intended file changes are explicit and reviewable.");
    if (permissions.includes("process:run")) {
      acceptanceCriteria.push("Relevant commands, tests, or runtime checks complete successfully.");
    }
    acceptanceCriteria.push(...request.constraints.map((constraint) => `Constraint satisfied: ${constraint}`));

    const ambiguities: string[] = [];
    if (/\b(this|that|whatever|something)\b/i.test(prompt) && request.context.length === 0) {
      ambiguities.push("The request references context that may not be attached.");
    }
    if (intent === "general-assistance") ambiguities.push("No specialized intent was confidently detected.");

    const confidence = Math.min(0.92, 0.58 + domains.length * 0.04 + (intent !== "general-assistance" ? 0.14 : 0));

    return {
      taskId: randomUUID(),
      intent,
      summary: prompt.length > 240 ? `${prompt.slice(0, 237)}...` : prompt,
      domains: unique(domains.length > 0 ? domains : ["general"]),
      complexity,
      risk: unique(risk),
      writeIntent,
      requiredPermissions: unique(permissions),
      acceptanceCriteria: unique(acceptanceCriteria),
      ambiguities,
      confidence,
    };
  }
}
