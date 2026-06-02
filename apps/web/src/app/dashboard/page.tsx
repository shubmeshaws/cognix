"use client";

import { HealApproval } from "@/components/HealApproval";
import { AgentConfigPanel } from "@/components/dashboard/AgentConfigPanel";
import { AgentTerminal } from "@/components/dashboard/AgentTerminal";
import { HealEventLog } from "@/components/dashboard/HealEventLog";
import { MetricCards } from "@/components/dashboard/MetricCards";
import { PodHealthTable } from "@/components/dashboard/PodHealthTable";
import { Topbar } from "@/components/dashboard/Topbar";
import {
  useAgentStatus,
  useAlerts,
  useHeals,
  usePods,
} from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

export default function DashboardPage() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const pods = useClusterStore((s) => s.pods);
  const heals = useClusterStore((s) => s.heals);
  const pendingApprovals = useClusterStore((s) => s.pendingApprovals);

  const podsQuery = usePods();
  useHeals(1, 50);
  useAlerts();
  const agentQuery = useAgentStatus();

  const loading =
    Boolean(activeClusterId) &&
    pods.length === 0 &&
    (podsQuery.isPending || podsQuery.isFetching) &&
    !podsQuery.isPlaceholderData;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Overview" />

      <div className="flex-1 space-y-5 p-5">
        {!activeClusterId && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Select a cluster in the sidebar, or connect one under{" "}
            <a href="/dashboard/clusters" className="font-medium underline">
              Clusters
            </a>
            .
          </p>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground">
            Loading pod data from your cluster…
          </p>
        )}

        {activeClusterId && podsQuery.isError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load pods. Check that the agent can reach the cluster API
            and try Scan now.
          </p>
        )}

        <HealApproval />

        <MetricCards pods={pods} heals={heals} />

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <PodHealthTable pods={pods} heals={heals} />
          <AgentTerminal />
          <HealEventLog heals={heals} />
          <AgentConfigPanel
            agent={agentQuery.data}
            pendingApprovals={pendingApprovals.length}
          />
        </div>
      </div>
    </div>
  );
}
