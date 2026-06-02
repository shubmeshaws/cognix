import {
  ALL_HEAL_RULE_IDS,
  DEFAULT_ENABLED_HEAL_RULES,
  normalizeHealRuleIds,
  normalizeHealRuleModes,
  type HealRuleId,
  type HealRuleMode,
} from "@kubehealer/shared";

import type { IssueType } from "../watcher/detectIssue.js";

export function defaultEnabledHealRules(): HealRuleId[] {
  return [...DEFAULT_ENABLED_HEAL_RULES];
}

export function normalizeStoredHealRules(
  stored: string[] | null | undefined,
): HealRuleId[] {
  return normalizeHealRuleIds(stored);
}

export function isHealRuleEnabled(
  enabled: Set<HealRuleId>,
  issueType: IssueType,
): boolean {
  return enabled.has(issueType as HealRuleId);
}

export function toEnabledSet(rules: HealRuleId[]): Set<HealRuleId> {
  return new Set(rules);
}

export function validateHealRuleModes(
  modes: Partial<Record<string, string>> | null | undefined,
  enabled: HealRuleId[],
): Record<HealRuleId, HealRuleMode> {
  return normalizeHealRuleModes(modes, enabled);
}

export function validateHealRuleUpdate(
  rules: string[],
): { ok: true; enabled: HealRuleId[] } | { ok: false; error: string } {
  if (!rules.length) {
    return { ok: false, error: "At least one heal rule must be enabled" };
  }
  const enabled = normalizeHealRuleIds(rules);
  if (!enabled.length) {
    return { ok: false, error: "No valid heal rule ids provided" };
  }
  const invalid = rules.filter(
    (r) => !ALL_HEAL_RULE_IDS.includes(r as HealRuleId),
  );
  if (invalid.length) {
    return { ok: false, error: `Unknown rules: ${invalid.join(", ")}` };
  }
  return { ok: true, enabled };
}
