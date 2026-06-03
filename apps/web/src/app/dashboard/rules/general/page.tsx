"use client";

import { ShieldCheck } from "lucide-react";

import { HealRulesConcurrencySettings } from "@/components/rules/HealRulesConcurrencySettings";
import { useHealRulesContext } from "@/components/rules/HealRulesProvider";
import { SettingsSection } from "@/components/settings/SettingsSection";

export default function RulesGeneralPage() {
  const { activeClusterId } = useHealRulesContext();

  return (
    <div className="flex-1 p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        {!activeClusterId && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Select a cluster in the sidebar to configure heal rules.
          </p>
        )}

        <SettingsSection
          title="How rules work"
          description="Enable issue types per resource tab and choose how the healer responds."
          icon={<ShieldCheck className="h-5 w-5 text-violet-500" />}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Auto</strong> — heal immediately when the issue is detected.
            </li>
            <li>
              <strong className="text-foreground">Approval</strong> — show an approval card on the dashboard first.
            </li>
            <li>
              Use the <strong className="text-foreground">Pods</strong>,{" "}
              <strong className="text-foreground">Nodes</strong>,{" "}
              <strong className="text-foreground">PVC</strong>, and{" "}
              <strong className="text-foreground">Addons</strong> tabs to configure each area.
            </li>
          </ul>
        </SettingsSection>

        <HealRulesConcurrencySettings />
      </div>
    </div>
  );
}
