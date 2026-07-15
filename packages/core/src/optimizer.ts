import { createHash } from "node:crypto";
import type { ResourceRef, TaskRequest, TaskUnderstanding } from "../../contracts/src/index.js";

export interface OptimizedContext {
  included: ResourceRef[];
  excluded: Array<{ resource: ResourceRef; reason: string }>;
  estimatedTokens: number;
  budget: number;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function fingerprint(resource: ResourceRef): string {
  return (
    resource.hash ??
    createHash("sha256")
      .update(resource.uri)
      .update("\0")
      .update(resource.content ?? "")
      .digest("hex")
  );
}

function relevance(resource: ResourceRef, request: TaskRequest, understanding: TaskUnderstanding): number {
  const haystack = `${resource.uri} ${resource.content ?? ""}`.toLowerCase();
  const terms = new Set(
    `${request.prompt} ${understanding.intent} ${understanding.domains.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9.+#-]+/)
      .filter((term) => term.length > 2),
  );
  const hits = [...terms].filter((term) => haystack.includes(term)).length;
  return resource.priority * 10 + hits;
}

export class ContextOptimizer {
  optimize(request: TaskRequest, understanding: TaskUnderstanding, budget: number): OptimizedContext {
    const excluded: OptimizedContext["excluded"] = [];
    const seen = new Set<string>();
    const unique = request.context.filter((resource) => {
      const key = fingerprint(resource);
      if (seen.has(key)) {
        excluded.push({ resource, reason: "duplicate" });
        return false;
      }
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => relevance(b, request, understanding) - relevance(a, request, understanding));
    const included: ResourceRef[] = [];
    let estimatedTokens = 0;

    for (const resource of unique) {
      const tokens = estimateTokens(`${resource.uri}\n${resource.content ?? ""}`);
      if (estimatedTokens + tokens > budget) {
        excluded.push({ resource, reason: "token-budget" });
        continue;
      }
      included.push(resource);
      estimatedTokens += tokens;
    }

    return { included, excluded, estimatedTokens, budget };
  }
}
