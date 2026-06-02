"use client";

import { useRouter } from "next/navigation";

import { AgentConfigRows } from "@/components/AgentConfigRows";
import { Panel } from "@/components/dashboard/Panel";
import { useSettingsStore } from "@/stores/settings";
import { useClusterStore } from "@/stores/cluster";
import type { AgentStatus } from "@/types/api";
import { useEffect } from "react";

export function AgentConfigPanel({
  agent,
  pendingApprovals,
}: {
  agent: AgentStatus | undefined;
  pendingApprovals: number;
}) {
  const router = useRouter();
  const wsConnected = useClusterStore((s) => s.wsConnected);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return (
    <Panel
      title="Agent config"
      viewAllPrompt="Open agent settings"
      onViewAll={() => router.push("/dashboard/settings")}
    >
      <AgentConfigRows
        agent={agent}
        pendingApprovals={pendingApprovals}
        wsConnected={wsConnected}
      />
    </Panel>
  );
}
