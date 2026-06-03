"use client";

import { usePathname } from "next/navigation";

import { Topbar } from "@/components/dashboard/Topbar";
import { useActiveClusterBootstrap } from "@/hooks/useActiveClusterBootstrap";
import { useClusterSocket } from "@/hooks/useClusterSocket";
import { getDashboardTitle } from "@/lib/dashboard-title";
import { usePendingApprovals } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  useActiveClusterBootstrap();
  useClusterSocket(activeClusterId);
  usePendingApprovals();

  return (
    <div className="ml-[200px] flex min-h-screen flex-col">
      <Topbar title={getDashboardTitle(pathname)} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
