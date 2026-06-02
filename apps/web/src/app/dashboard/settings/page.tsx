"use client";

import { useEffect } from "react";

import { AgentSettingsForm } from "@/components/settings/AgentSettingsForm";
import { Topbar } from "@/components/dashboard/Topbar";
import { useSettingsStore } from "@/stores/settings";

export default function SettingsPage() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Settings" />
      <div className="flex-1 p-6">
        <AgentSettingsForm />
      </div>
    </div>
  );
}
