"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Laptop, Trash2 } from "lucide-react";

import { ConnectCluster } from "@/components/ConnectCluster";
import { Topbar } from "@/components/dashboard/Topbar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAgentToken } from "@/hooks/useAgentToken";
import { deleteCluster, parseApiErrorMessage } from "@/lib/api";
import { useClusters } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import type { ClusterListItem, ConnectClusterResult } from "@/types/api";

type ConnectFlow = "choose" | "local" | "upload" | "in-cluster";

export default function ClustersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [connectFlow, setConnectFlow] = useState<ConnectFlow>("choose");
  const [removeTarget, setRemoveTarget] = useState<ClusterListItem | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const token = useAgentToken();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const setCluster = useClusterStore((s) => s.setCluster);
  const clustersQuery = useClusters();
  const clusters = clustersQuery.data ?? [];
  const hasClusters = clusters.length > 0;

  const handleRemove = async () => {
    if (!removeTarget) return;
    if (!token) {
      setRemoveError("Not signed in — reload the page or wait for the dev token to load.");
      return;
    }

    setRemoving(true);
    setRemoveError(null);
    const removedId = removeTarget.id;

    try {
      await deleteCluster(token, removedId);
      if (activeClusterId === removedId) {
        const remaining = clusters.filter((c) => c.id !== removedId);
        setCluster(remaining[0]?.id ?? null);
      }
      setRemoveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["clusters"] });
      await queryClient.invalidateQueries({ queryKey: ["pods"] });
    } catch (err) {
      setRemoveError(parseApiErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  const handleConnected = (result: ConnectClusterResult) => {
    setCluster(result.clusterId);
    void queryClient.invalidateQueries({ queryKey: ["clusters"] });
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Clusters" />

      <div className="flex flex-1 flex-col p-6">
        {hasClusters && (
          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Connected clusters</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void clustersQuery.refetch()}
              >
                Refresh
              </Button>
            </div>
            <ul className="divide-y rounded-lg border">
              {clusters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.serverUrl}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        c.health.ok
                          ? "text-xs text-emerald-600"
                          : "text-xs text-amber-600"
                      }
                    >
                      {c.health.ok ? c.health.version : "Unreachable"}
                    </span>
                    <Button
                      variant={activeClusterId === c.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setCluster(c.id);
                        router.push("/dashboard");
                      }}
                    >
                      {activeClusterId === c.id ? "Active" : "Use"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setRemoveError(null);
                        setRemoveTarget(c);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ConfirmDialog
          open={removeTarget !== null}
          title="Remove cluster?"
          description={
            removeTarget
              ? `Disconnect "${removeTarget.name}" from KubeHealer? This stops watching and deletes the cluster record. You can reconnect later.`
              : ""
          }
          error={removeError}
          confirmLabel="Remove"
          variant="destructive"
          loading={removing}
          onCancel={() => {
            if (!removing) {
              setRemoveTarget(null);
              setRemoveError(null);
            }
          }}
          onConfirm={() => {
            void handleRemove();
          }}
        />

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-3xl">
            {hasClusters && (
              <h2 className="mb-4 text-center text-lg font-semibold">
                Connect another cluster
              </h2>
            )}
            <div className="mb-6 flex flex-wrap justify-center gap-2">
              <Button
                variant={connectFlow === "local" ? "default" : "outline"}
                size="sm"
                onClick={() => setConnectFlow("local")}
              >
                <Laptop className="mr-2 h-4 w-4" />
                Local kubeconfig
              </Button>
              <Button
                variant={connectFlow === "upload" ? "default" : "outline"}
                size="sm"
                onClick={() => setConnectFlow("upload")}
              >
                <CloudUpload className="mr-2 h-4 w-4" />
                Upload kubeconfig
              </Button>
              <Button
                variant={connectFlow === "choose" ? "default" : "outline"}
                size="sm"
                onClick={() => setConnectFlow("choose")}
              >
                All options
              </Button>
            </div>
            <ConnectCluster
              key={connectFlow}
              initialFlow={connectFlow}
              onConnected={handleConnected}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
