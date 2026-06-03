"use client";

import { Brain } from "lucide-react";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { LlmProviderChain } from "@/components/settings/LlmProviderChain";

export function LlmProviderChainSettings() {
  return (
    <SettingsSection
      title="LLM provider chain"
      description="Primary and fallback AI providers used by Meshy and the healing agent."
      tooltip="Order matters: Primary is tried first, then 1st fallback, then 2nd fallback."
      icon={<Brain className="h-5 w-5 text-muted-foreground" />}
    >
      <LlmProviderChain embedded />
    </SettingsSection>
  );
}
