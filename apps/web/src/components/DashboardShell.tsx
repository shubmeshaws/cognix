"use client";

import { useActiveClusterBootstrap } from "@/hooks/useActiveClusterBootstrap";
import { useClusterSocket } from "@/hooks/useClusterSocket";
import { usePendingApprovals } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  useActiveClusterBootstrap();
  useClusterSocket(activeClusterId);
  usePendingApprovals();

  return (
    <div className="ml-[200px] flex min-h-screen flex-col">
      {children}
    </div>
  );
}
