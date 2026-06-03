"use client";

import { AgentConfigRows } from "@/components/AgentConfigRows";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useAgentStatus } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

export function AgentLivePreviewSettings() {
  const agentQuery = useAgentStatus();
  const wsConnected = useClusterStore((s) => s.wsConnected);
  const pendingApprovals = useClusterStore((s) => s.pendingApprovals);

  return (
    <SettingsSection
      title="Live preview"
      description="Same summary shown on the dashboard Agent config panel."
    >
      <div className="-mx-2 rounded-lg border">
        <AgentConfigRows
          agent={agentQuery.data}
          pendingApprovals={pendingApprovals.length}
          wsConnected={wsConnected}
        />
      </div>
    </SettingsSection>
  );
}
