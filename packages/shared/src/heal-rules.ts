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

export type HealRuleCategory = "pods" | "nodes" | "pvc" | "addons";

export interface HealRuleSectionDefinition {
  id: HealRuleCategory;
  title: string;
  description: string;
}

export interface HealRuleDefinition {
  id: HealRuleId;
  label: string;
  description: string;
  category: HealRuleCategory;
}

export const HEAL_RULE_SECTIONS: HealRuleSectionDefinition[] = [
  {
    id: "pods",
    title: "Pods",
    description:
      "Frequent workload issues — crash loops, memory, image pull, and scheduling.",
  },
  {
    id: "nodes",
    title: "Nodes",
    description: "Node-level pressure and capacity problems affecting scheduling.",
  },
  {
    id: "pvc",
    title: "PVC & storage",
    description: "Persistent volume attach, mount, and multi-attach conflicts.",
  },
  {
    id: "addons",
    title: "Addons",
    description:
      "Cluster add-ons and platform components (ingress, cert-manager, operators).",
  },
];

export const HEAL_RULE_CATALOG: HealRuleDefinition[] = [
  {
    id: "CrashLoop",
    label: "CrashLoopBackOff",
    description: "Container repeatedly crashes after start.",
    category: "pods",
  },
  {
    id: "OOM",
    label: "OOMKilled",
    description: "Pod killed due to memory limit (exit 137).",
    category: "pods",
  },
  {
    id: "ImagePull",
    label: "ImagePullBackOff",
    description: "Cannot pull container image (ImagePull / ErrImagePull).",
    category: "pods",
  },
  {
    id: "Pending",
    label: "Long pending",
    description: "Pod stuck in Pending beyond the threshold.",
    category: "pods",
  },
  {
    id: "NodePressure",
    label: "Node pressure",
    description: "Node disk or memory pressure affecting scheduling.",
    category: "nodes",
  },
  {
    id: "MultiVolumeAttachment",
    label: "Multi-volume attach",
    description: "Volume already attached elsewhere or mount failed.",
    category: "pvc",
  },
];

export const ALL_HEAL_RULE_IDS: HealRuleId[] = HEAL_RULE_CATALOG.map((r) => r.id);

export const DEFAULT_ENABLED_HEAL_RULES: HealRuleId[] = [...ALL_HEAL_RULE_IDS];

export function groupHealRulesByCategory(
  catalog: HealRuleDefinition[] = HEAL_RULE_CATALOG,
): Record<HealRuleCategory, HealRuleDefinition[]> {
  const grouped = {
    pods: [],
    nodes: [],
    pvc: [],
    addons: [],
  } as Record<HealRuleCategory, HealRuleDefinition[]>;

  for (const rule of catalog) {
    grouped[rule.category].push(rule);
  }

  return grouped;
}

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
