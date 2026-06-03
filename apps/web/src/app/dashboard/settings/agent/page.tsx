import { AgentLivePreviewSettings } from "@/components/settings/AgentLivePreviewSettings";
import { HealingModeSettings } from "@/components/settings/HealingModeSettings";
import { LlmProviderChainSettings } from "@/components/settings/LlmProviderChainSettings";

export default function SettingsAgentPage() {
  return (
    <div className="flex-1 p-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <LlmProviderChainSettings />
        <HealingModeSettings />
        <AgentLivePreviewSettings />
      </div>
    </div>
  );
}
