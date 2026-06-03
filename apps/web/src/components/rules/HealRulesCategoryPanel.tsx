"use client";

import { HEAL_RULE_SECTIONS, type HealRuleCategory } from "@kubehealer/shared";
import { Box, HardDrive, Layers, Server } from "lucide-react";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { HealRulesList } from "@/components/rules/HealRulesList";
import { HealRulesJobPodsToggle } from "@/components/rules/HealRulesJobPodsToggle";
import { HealRulesWorkerPodsToggle } from "@/components/rules/HealRulesWorkerPodsToggle";
import { useHealRulesContext } from "@/components/rules/HealRulesProvider";
import { ADDON_HEAL_RULE_PLACEHOLDERS } from "@/lib/heal-rule-sections";

const CATEGORY_ICONS = {
  pods: Box,
  nodes: Server,
  pvc: HardDrive,
  addons: Layers,
} as const;

export function HealRulesCategoryPanel({
  category,
}: {
  category: HealRuleCategory;
}) {
  const Icon = CATEGORY_ICONS[category];
  const {
    activeClusterId,
    groupedRules,
    selected,
    modes,
    controlsDisabled,
    isLoading,
    isError,
    queryError,
    toggle,
    setMode,
    enabledCount,
  } = useHealRulesContext();

  const section = HEAL_RULE_SECTIONS.find((s) => s.id === category)!;
  const rules = groupedRules[category];
  const placeholders =
    category === "addons" ? ADDON_HEAL_RULE_PLACEHOLDERS : undefined;

  return (
    <div className="flex-1 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {!activeClusterId && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Select a cluster in the sidebar to configure which issues the healer
            will act on.
          </p>
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading rules…</p>
        )}

        {isError && queryError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {queryError}
          </p>
        )}

        {!isLoading && (
          <SettingsSection
            title={section.title}
            description={section.description}
            tooltip={`${enabledCount(category)} rules enabled in this section.`}
            icon={<Icon className="h-5 w-5 text-violet-500" />}
          >
            <HealRulesList
              rules={rules}
              placeholders={placeholders}
              selected={selected}
              modes={modes}
              disabled={controlsDisabled}
              onToggle={toggle}
              onSetMode={setMode}
            />
            {category === "pods" && (
              <>
                <HealRulesJobPodsToggle />
                <HealRulesWorkerPodsToggle />
              </>
            )}
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
