import type {
  CapabilityManifest,
  Permission,
  PermissionDecision,
  PermissionOutcome,
} from "../../contracts/src/index.js";

export type PermissionMode = "strict" | "balanced" | "developer";
export type PermissionTable = Record<Permission, PermissionOutcome>;

const PRESETS: Record<PermissionMode, PermissionTable> = {
  strict: {
    "filesystem:read": "allow",
    "filesystem:write": "ask",
    "process:run": "ask",
    "network:access": "ask",
    "secrets:read": "deny",
    destructive: "deny",
  },
  balanced: {
    "filesystem:read": "allow",
    "filesystem:write": "allow",
    "process:run": "ask",
    "network:access": "ask",
    "secrets:read": "deny",
    destructive: "deny",
  },
  developer: {
    "filesystem:read": "allow",
    "filesystem:write": "allow",
    "process:run": "allow",
    "network:access": "ask",
    "secrets:read": "deny",
    destructive: "deny",
  },
};

export interface PolicyEvaluation {
  allowed: boolean;
  decisions: PermissionDecision[];
  pendingApprovals: string[];
  denied: string[];
}

export class PermissionPolicy {
  constructor(
    private readonly defaults: PermissionTable,
    private readonly overrides: Record<string, Partial<PermissionTable>> = {},
  ) {}

  static fromMode(mode: PermissionMode): PermissionPolicy {
    return new PermissionPolicy(PRESETS[mode]);
  }

  evaluate(
    manifest: CapabilityManifest,
    requiredPermissions: Permission[],
    approvals: string[] = [],
  ): PolicyEvaluation {
    const approvalSet = new Set(approvals);
    const decisions: PermissionDecision[] = requiredPermissions.map((permission) => {
      const outcome = this.overrides[manifest.id]?.[permission] ?? this.defaults[permission];
      return {
        capabilityId: manifest.id,
        permission,
        outcome,
        reason: this.overrides[manifest.id]?.[permission]
          ? "capability-specific override"
          : "permission preset",
      };
    });

    const denied = decisions
      .filter((decision) => decision.outcome === "deny")
      .map((decision) => `${decision.capabilityId}:${decision.permission}`);
    const pendingApprovals = decisions
      .filter(
        (decision) =>
          decision.outcome === "ask" &&
          !approvalSet.has(decision.permission) &&
          !approvalSet.has(`${decision.capabilityId}:${decision.permission}`),
      )
      .map((decision) => `${decision.capabilityId}:${decision.permission}`);

    return {
      allowed: denied.length === 0 && pendingApprovals.length === 0,
      decisions,
      pendingApprovals,
      denied,
    };
  }
}
