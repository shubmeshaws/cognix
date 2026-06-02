"use client";

import { useAgentToken } from "@/hooks/useAgentToken";
import {
  CloudUpload,
  Copy,
  Check,
  Laptop,
  Loader2,
  Server,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  clusterNameExists,
  DUPLICATE_CLUSTER_NAME_MESSAGE,
} from "@/lib/cluster-names";
import {
  connectCluster,
  connectLocalCluster,
  createClusterRegistration,
  fetchLocalKubeconfig,
  fetchRegistrationStatus,
  parseApiErrorMessage,
} from "@/lib/api";
import { useClusters } from "@/lib/query";
import {
  buildCustomInstallManifest,
  getKubectlApplyCommand,
  parseNamespaceFilter,
} from "@/lib/install-manifest";
import type { ConnectClusterResult } from "@/types/api";
import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";

type Flow = "choose" | "local" | "upload" | "in-cluster" | "success";
type ConnectPhase = "idle" | "testing" | "success" | "error";

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <pre className="max-h-32 flex-1 overflow-auto rounded-md border bg-muted/50 p-2 text-xs">
          {value}
        </pre>
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function ConnectCluster({
  onConnected,
  initialFlow = "choose",
}: {
  onConnected?: (result: ConnectClusterResult) => void;
  initialFlow?: Flow;
}) {
  const router = useRouter();
  const setCluster = useClusterStore((s) => s.setCluster);

  const [flow, setFlow] = useState<Flow>(initialFlow);
  const [kubeconfig, setKubeconfig] = useState("");
  const [contextName, setContextName] = useState("");
  const [contextOptions, setContextOptions] = useState<string[]>([]);
  const [localConfigPath, setLocalConfigPath] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [name, setName] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState("");
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectClusterResult | null>(null);

  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const [registerExpires, setRegisterExpires] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [customManifest, setCustomManifest] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const token = useAgentToken();
  const clustersQuery = useClusters();
  const connectedClusters = clustersQuery.data ?? [];

  const finish = useCallback(
    (connectResult: ConnectClusterResult) => {
      setResult(connectResult);
      setPhase("success");
      setFlow("success");
      setCluster(connectResult.clusterId);
      onConnected?.(connectResult);
    },
    [onConnected, setCluster],
  );

  const connectWithKubeconfig = async () => {
    if (!token || !name.trim()) return;
    if (flow !== "local" && !kubeconfig.trim()) return;

    if (clusterNameExists(connectedClusters, name)) {
      setPhase("error");
      setError(DUPLICATE_CLUSTER_NAME_MESSAGE);
      return;
    }

    setPhase("testing");
    setError(null);

    try {
      const res =
        flow === "local"
          ? await connectLocalCluster(token, {
              name: name.trim(),
              contextName: contextName.trim() || undefined,
              namespaceFilter: parseNamespaceFilter(namespaceFilter),
            })
          : await connectCluster(token, {
              name: name.trim(),
              kubeconfig: kubeconfig.trim(),
              contextName: contextName.trim() || undefined,
              namespaceFilter: parseNamespaceFilter(namespaceFilter),
            });
      finish(res);
    } catch (err) {
      setPhase("error");
      setError(parseApiErrorMessage(err));
    }
  };

  const loadLocalKubeconfig = async () => {
    if (!token) return;
    setLocalLoading(true);
    setError(null);

    try {
      const local = await fetchLocalKubeconfig(token);
      setKubeconfig(local.kubeconfig);
      setLocalConfigPath(local.path);
      setContextOptions(local.contexts);
      const ctx = local.currentContext ?? local.contexts[0] ?? "";
      setContextName(ctx);
      if (!name.trim() && ctx) {
        setName(ctx.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 128));
      }
    } catch (err) {
      setError(parseApiErrorMessage(err));
    } finally {
      setLocalLoading(false);
    }
  };

  const startInCluster = async () => {
    if (!token || !name.trim()) return;

    if (clusterNameExists(connectedClusters, name)) {
      setError(DUPLICATE_CLUSTER_NAME_MESSAGE);
      return;
    }

    setError(null);
    setPolling(true);

    try {
      const reg = await createClusterRegistration(token, {
        name: name.trim(),
        namespaceFilter: parseNamespaceFilter(namespaceFilter),
      });
      setRegisterToken(reg.token);
      setRegisterExpires(reg.expiresAt);
      const manifest = await buildCustomInstallManifest(
        reg.clusterToken ?? reg.token,
      );
      setCustomManifest(manifest);
      setFlow("in-cluster");
    } catch (err) {
      setPolling(false);
      setError(parseApiErrorMessage(err));
    }
  };

  useEffect(() => {
    if (flow !== "local" || kubeconfig.trim() || !token) return;
    void loadLocalKubeconfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when entering local flow
  }, [flow, token]);

  useEffect(() => {
    if (!polling || !registerToken || !token) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const status = await fetchRegistrationStatus(token, registerToken);
        if (cancelled) return;
        if (status.status === "connected") {
          setPolling(false);
          finish(status.result);
        }
      } catch {
        // keep polling
      }
    };

    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [polling, registerToken, token, finish]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setKubeconfig(reader.result);
    };
    reader.readAsText(file);
  };

  const goDashboard = () => {
    router.push("/dashboard");
  };

  if (flow === "success" && result) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Cluster connected</h2>
        <dl className="mt-6 space-y-2 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Kubernetes version</dt>
            <dd className="font-medium">{result.version}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Nodes</dt>
            <dd className="font-medium">
              {result.nodeCount != null ? result.nodeCount : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Namespaces</dt>
            <dd className="max-w-[200px] truncate font-medium">
              {result.namespaces.length > 0
                ? result.namespaces.slice(0, 5).join(", ") +
                  (result.namespaces.length > 5
                    ? ` +${result.namespaces.length - 5}`
                    : "")
                : "—"}
            </dd>
          </div>
        </dl>
        <Button className="mt-8 w-full" onClick={goDashboard}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  const contextFields = (
    <>
      <label className="block text-sm font-medium">
        Cluster name
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="prod-eks-us-east-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {contextOptions.length > 0 && (
        <label className="block text-sm font-medium">
          Context
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={contextName}
            onChange={(e) => setContextName(e.target.value)}
          >
            {contextOptions.map((ctx) => (
              <option key={ctx} value={ctx}>
                {ctx}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-medium">
        Namespace filter{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          placeholder="default, production — empty watches up to 20 namespaces"
          value={namespaceFilter}
          onChange={(e) => setNamespaceFilter(e.target.value)}
        />
      </label>
    </>
  );

  if (flow === "local") {
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Local kubeconfig</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read <code className="text-xs">~/.kube/config</code> (or{" "}
            <code className="text-xs">KUBECONFIG</code>) from the machine running
            the agent — typical for minikube, Docker Desktop, or kind on your laptop.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadLocalKubeconfig()}
            disabled={localLoading || !token}
          >
            {localLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              "Load from ~/.kube/config"
            )}
          </Button>
          {localConfigPath && (
            <p className="self-center text-xs text-muted-foreground">
              Loaded: <code className="text-xs">{localConfigPath}</code>
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Connect reads kubeconfig on the agent host (fast). Use load only to pick
          a context name{contextName ? ` — “${contextName}”` : ""}.
          {localConfigPath ? (
            <>
              {" "}
              Loaded <code className="text-xs">{localConfigPath}</code>.
            </>
          ) : null}
        </p>

        <div className="space-y-3">{contextFields}</div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setFlow("choose")}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={phase === "testing" || !name.trim()}
            onClick={connectWithKubeconfig}
          >
            {phase === "testing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (flow === "upload") {
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Upload kubeconfig</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste your kubeconfig YAML or drag a file onto the area below.
          </p>
        </div>

        <div
          className={cn(
            "rounded-lg border-2 border-dashed p-4 transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) readFile(file);
          }}
        >
          <textarea
            className="min-h-[160px] w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="apiVersion: v1&#10;kind: Config&#10;..."
            value={kubeconfig}
            onChange={(e) => setKubeconfig(e.target.value)}
          />
          <label className="mt-2 inline-flex cursor-pointer text-xs text-primary hover:underline">
            <input
              type="file"
              accept=".yaml,.yml,.txt,text/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
              }}
            />
            Or choose a file
          </label>
        </div>

        <div className="space-y-3">{contextFields}</div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setFlow("choose")}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={phase === "testing" || !kubeconfig.trim() || !name.trim()}
            onClick={connectWithKubeconfig}
          >
            {phase === "testing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing connection…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (flow === "in-cluster") {
    const kubectlCmd = getKubectlApplyCommand();
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        {!registerToken && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              Cluster name
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="prod-eks-us-east-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Namespace filter{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="default, staging"
                value={namespaceFilter}
                onChange={(e) => setNamespaceFilter(e.target.value)}
              />
            </label>
            <Button
              className="w-full"
              disabled={!name.trim() || !token}
              onClick={() => void startInCluster()}
            >
              Generate install manifest
            </Button>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold">In-cluster agent</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Apply the manifest below to <code className="text-xs">kubehealer-system</code>.
            The Deployment calls{" "}
            <code className="text-xs">POST /api/clusters/connect</code> with{" "}
            <code className="text-xs">inCluster: true</code> and your cluster token
            — no kubeconfig upload.
          </p>
        </div>

        {registerToken && (
          <CopyField
            value={registerToken}
            label="KUBEHEALER_CLUSTER_TOKEN (also embedded in manifest below)"
          />
        )}
        <CopyField value={kubectlCmd} label="kubectl command (after saving manifest)" />
        {customManifest && (
          <CopyField
            value={customManifest}
            label="Manifest — apply with kubectl apply -f -"
          />
        )}

        <div className="rounded-md border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {polling ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Server className="h-4 w-4 text-muted-foreground" />
            )}
            Waiting for agent to phone home…
          </div>
          {registerExpires && (
            <p className="mt-1 text-xs text-muted-foreground">
              Registration expires {new Date(registerExpires).toLocaleString()}
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <Button variant="outline" onClick={() => setFlow("choose")}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-bold tracking-tight">Connect your cluster</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose how KubeHealer should reach your Kubernetes API.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setFlow("local");
            setError(null);
            setPhase("idle");
          }}
          className="rounded-lg border bg-card p-6 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <Laptop className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-semibold">Local kubeconfig</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Use <code className="text-xs">~/.kube/config</code> on the agent host
            (Docker Desktop, minikube, kind).
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setFlow("upload");
            setError(null);
            setPhase("idle");
          }}
          className="rounded-lg border bg-card p-6 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <CloudUpload className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-semibold">Upload kubeconfig</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Paste or drag-drop a kubeconfig file from any machine.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setFlow("in-cluster");
            setError(null);
            setPhase("idle");
          }}
          className="rounded-lg border bg-card p-6 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <Server className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-semibold">In-cluster agent</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Deploy the agent into your cluster; it phones home with a one-time
            cluster token.
          </p>
        </button>
      </div>

      <p className="mx-auto mt-6 max-w-lg text-xs text-muted-foreground">
        For in-cluster setup, enter a cluster name on the next screen after you
        choose that option.
      </p>
    </div>
  );
}
