import { DashboardShell } from "@/components/DashboardShell";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
