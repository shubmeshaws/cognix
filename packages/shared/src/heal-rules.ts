/** Issue types the healer can detect and optionally auto-remediate. */
export type HealRuleId =
  | "CrashLoop"
  | "OOM"
  | "ImagePull"
  | "Pending"
  | "NodePressure"
  | "MultiVolumeAttachment";

/** How an enabled rule is applied: automatic fix vs dashboard approval. */
export type HealRuleMode = "auto" | "approval";

export interface HealRuleDefinition {
  id: HealRuleId;
  label: string;
  description: string;
}

export const HEAL_RULE_CATALOG: HealRuleDefinition[] = [
  {
    id: "CrashLoop",
    label: "CrashLoopBackOff",
    description: "Container repeatedly crashes after start.",
  },
  {
    id: "OOM",
    label: "OOMKilled",
    description: "Pod killed due to memory limit (exit 137).",
  },
  {
    id: "ImagePull",
    label: "ImagePullBackOff",
    description: "Cannot pull container image (ImagePull / ErrImagePull).",
  },
  {
    id: "Pending",
    label: "Long pending",
    description: "Pod stuck in Pending beyond the threshold.",
  },
  {
    id: "NodePressure",
    label: "Node pressure",
    description: "Node disk or memory pressure affecting scheduling.",
  },
  {
    id: "MultiVolumeAttachment",
    label: "Multi-volume attach",
    description: "Volume already attached elsewhere or mount failed.",
  },
];

export const ALL_HEAL_RULE_IDS: HealRuleId[] = HEAL_RULE_CATALOG.map((r) => r.id);

export const DEFAULT_ENABLED_HEAL_RULES: HealRuleId[] = [...ALL_HEAL_RULE_IDS];

export function normalizeHealRuleIds(
  rules: string[] | null | undefined,
): HealRuleId[] {
  const allowed = new Set(ALL_HEAL_RULE_IDS);
  if (!rules?.length) return [...DEFAULT_ENABLED_HEAL_RULES];
  return rules.filter((r): r is HealRuleId => allowed.has(r as HealRuleId));
}

export function buildHealRulesState(enabled: HealRuleId[]): Record<HealRuleId, boolean> {
  const set = new Set(enabled);
  return Object.fromEntries(
    ALL_HEAL_RULE_IDS.map((id) => [id, set.has(id)]),
  ) as Record<HealRuleId, boolean>;
}

export function healRulesFromState(
  state: Record<string, boolean>,
): HealRuleId[] {
  return ALL_HEAL_RULE_IDS.filter((id) => state[id] === true);
}

export function normalizeHealRuleModes(
  stored: Partial<Record<string, string>> | null | undefined,
  enabled: HealRuleId[],
): Record<HealRuleId, HealRuleMode> {
  const modes = {} as Record<HealRuleId, HealRuleMode>;
  for (const id of enabled) {
    const raw = stored?.[id];
    modes[id] = raw === "approval" ? "approval" : "auto";
  }
  return modes;
}

export function healRuleRequiresApproval(
  issueType: string,
  modes: Partial<Record<HealRuleId, HealRuleMode>>,
): boolean {
  return modes[issueType as HealRuleId] === "approval";
}

export function approvalHealRulesFromModes(
  modes: Partial<Record<HealRuleId, HealRuleMode>>,
): HealRuleId[] {
  return ALL_HEAL_RULE_IDS.filter((id) => modes[id] === "approval");
}
