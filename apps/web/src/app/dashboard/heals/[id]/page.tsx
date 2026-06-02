"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Topbar } from "@/components/dashboard/Topbar";
import { Terminal } from "@/components/Terminal";
import { TerminalModal } from "@/components/TerminalModal";
import { Button } from "@/components/ui/button";
import { useHeals } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

export default function HealDetailPage() {
  const params = useParams();
  const healId = typeof params.id === "string" ? params.id : "";
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const heals = useClusterStore((s) => s.heals);
  useHeals();

  const heal = useMemo(
    () => heals.find((h) => h.id === healId),
    [heals, healId],
  );

  const [fullscreen, setFullscreen] = useState(false);
  const useLive = heal?.status === "pending";

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Heal detail" />

      <div className="space-y-4 p-6">
        <Link
          href="/dashboard/heals"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Heal log
        </Link>

        {heal ? (
          <div className="rounded-lg border p-4">
            <h2 className="text-lg font-semibold">
              {heal.podName} · {heal.namespace}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {heal.issueType} — {heal.actionTaken} —{" "}
              <span className="font-medium">{heal.status}</span>
              {heal.durationMs > 0 ? ` · ${heal.durationMs}ms` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Heal {healId}</p>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Terminal session</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFullscreen(true)}
          >
            Full screen
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Terminal
            healId={healId}
            live={useLive}
            heightClassName="h-[360px]"
          />
        </div>
      </div>

      <TerminalModal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={heal ? `Heal · ${heal.podName}` : "Heal terminal"}
        healId={healId}
        live={useLive}
      />
    </div>
  );
}
