import { AuthGate } from "@/components/auth/AuthGate";
import { DashboardShell } from "@/components/DashboardShell";
import { LlmConfigBootstrap } from "@/components/settings/LlmConfigBootstrap";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <LlmConfigBootstrap />
      <Sidebar />
      <DashboardShell>
        <AuthGate>{children}</AuthGate>
      </DashboardShell>
    </div>
  );
}
