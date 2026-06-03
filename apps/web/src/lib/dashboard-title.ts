/** Page title for the dashboard top bar from the current pathname. */
export function getDashboardTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/pods")) return "Pods";
  if (pathname.startsWith("/dashboard/alerts")) return "Alerts";
  if (pathname.match(/^\/dashboard\/heals\/[^/]+$/)) return "Heal detail";
  if (pathname.startsWith("/dashboard/heals")) return "Heal log";
  if (pathname.startsWith("/dashboard/nodes")) return "Nodes";
  if (pathname.startsWith("/dashboard/clusters")) return "Clusters";
  if (pathname.startsWith("/dashboard/setup")) return "Setup";
  if (pathname.startsWith("/dashboard/rules")) return "Rules";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  if (pathname.startsWith("/dashboard/meshy/alerts")) return "Voice alerts";
  if (pathname.startsWith("/dashboard/meshy")) return "Meshy";
  if (pathname.startsWith("/dashboard/copilot")) return "Meshy";
  return "Dashboard";
}
