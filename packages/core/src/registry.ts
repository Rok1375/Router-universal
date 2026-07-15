import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CapabilityManifest,
  RouteSelection,
  TaskRequest,
  TaskUnderstanding,
} from "../../contracts/src/index.js";
import { CapabilityManifestSchema } from "../../contracts/src/index.js";

export interface DiscoveryIssue {
  path: string;
  message: string;
}

export interface DiscoveryReport {
  loaded: string[];
  skipped: string[];
  issues: DiscoveryIssue[];
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "your",
  "you",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "as",
  "or",
  "be",
  "by",
]);
const TRUST_SCORE: Record<CapabilityManifest["trustLevel"], number> = {
  untrusted: -8,
  community: 0,
  verified: 6,
  local: 8,
};

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9.+#-]+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function overlap(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

export class CapabilityRegistry {
  private readonly manifests = new Map<string, CapabilityManifest>();

  register(input: CapabilityManifest): CapabilityManifest {
    const manifest = CapabilityManifestSchema.parse(input);
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  get(id: string): CapabilityManifest | undefined {
    return this.manifests.get(id);
  }

  list(options: { enabledOnly?: boolean } = {}): CapabilityManifest[] {
    return [...this.manifests.values()]
      .filter((manifest) => !options.enabledOnly || manifest.enabled)
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  }

  async discover(directory: string): Promise<DiscoveryReport> {
    const report: DiscoveryReport = { loaded: [], skipped: [], issues: [] };

    const visit = async (current: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch (error) {
        report.issues.push({
          path: current,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      for (const entry of entries) {
        const path = join(current, entry.name);
        if (entry.isSymbolicLink()) {
          report.skipped.push(path);
        } else if (entry.isDirectory()) {
          await visit(path);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
          try {
            const parsed = JSON.parse(await readFile(path, "utf8"));
            const manifest = CapabilityManifestSchema.parse(parsed);
            this.register(manifest);
            report.loaded.push(manifest.id);
          } catch (error) {
            report.issues.push({
              path,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    };

    await visit(directory);
    return report;
  }

  select(request: TaskRequest, understanding: TaskUnderstanding): RouteSelection {
    const requestTokens = tokens(
      [request.prompt, understanding.intent, ...understanding.domains, ...request.constraints].join(
        " ",
      ),
    );
    const denied = new Set(request.deniedCapabilities);
    const preferred = new Set(request.preferredCapabilities);
    const scored = this.list({ enabledOnly: true })
      .filter((manifest) => !denied.has(manifest.id))
      .map((manifest) => {
        const capabilityTokens = tokens(
          [manifest.name, manifest.description, ...manifest.tags, ...manifest.intents].join(" "),
        );
        const matches = overlap(requestTokens, capabilityTokens);
        const intentMatch = manifest.intents.includes(understanding.intent) ? 12 : 0;
        const domainMatches = manifest.tags.filter((tag) =>
          understanding.domains.includes(tag),
        ).length;
        const preference = preferred.has(manifest.id) ? 25 : 0;
        const relevance = matches.length * 3 + intentMatch + domainMatches * 5 + preference;
        const score = relevance + manifest.priority + TRUST_SCORE[manifest.trustLevel];
        const reasons = [
          ...matches.slice(0, 6).map((match) => `keyword:${match}`),
          ...(intentMatch > 0 ? [`intent:${understanding.intent}`] : []),
          ...(domainMatches > 0 ? [`domain-match:${domainMatches}`] : []),
          ...(preference > 0 ? ["user-preferred"] : []),
          `trust:${manifest.trustLevel}`,
        ];
        return { manifest, score, relevance, reasons };
      })
      .filter((entry) => entry.relevance > 0)
      .sort((a, b) => b.score - a.score || a.manifest.id.localeCompare(b.manifest.id));

    const limit =
      understanding.complexity === "complex" || understanding.complexity === "high-risk" ? 3 : 1;
    const selected = scored.slice(0, limit);
    const verification = understanding.writeIntent
      ? scored.find(
          (entry) =>
            !selected.includes(entry) &&
            (entry.manifest.tags.includes("verification") ||
              entry.manifest.intents.includes("review-work")),
        )
      : undefined;
    if (verification) selected.push(verification);

    return {
      selectedCapabilityIds: selected.map((entry) => entry.manifest.id),
      reasons: Object.fromEntries(selected.map((entry) => [entry.manifest.id, entry.reasons])),
      scores: Object.fromEntries(selected.map((entry) => [entry.manifest.id, entry.score])),
      unmetRequirements:
        selected.length === 0 ? ["No installed capability matched the understood task."] : [],
    };
  }
}
