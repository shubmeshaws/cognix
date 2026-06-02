"use client";

import { useState, useMemo } from "react";
import { 
  Server, 
  Cpu, 
  Activity, 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  RefreshCw, 
  Loader2, 
  X,
  Search,
  Filter,
  Terminal,
} from "lucide-react";

import { Topbar } from "@/components/dashboard/Topbar";
import { useClusterStore } from "@/stores/cluster";
import { usePods, usePodLogs } from "@/lib/query";
import { triggerManualPodHeal, parseApiErrorMessage } from "@/lib/api";
import { useAgentToken } from "@/hooks/useAgentToken";
import type { PodSummary } from "@/types/api";

export default function PodsPage() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const token = useAgentToken();
  const { data: pods, isLoading, isError, refetch, isFetching } = usePods();

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("All");
  const [selectedPhase, setSelectedPhase] = useState("All");
  const [selectedIssue, setSelectedIssue] = useState("All");

  // Selection & Details State
  const [selectedPodKey, setSelectedPodKey] = useState<string | null>(null); // "namespace/name"
  const [activeTab, setActiveTab] = useState<"spec" | "logs">("spec");
  
  // Healing state
  const [isHealing, setIsHealing] = useState(false);
  const [healMessage, setHealMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedPod = useMemo(() => {
    if (!selectedPodKey || !pods) return null;
    const [ns, name] = selectedPodKey.split("/");
    return pods.find((p) => p.namespace === ns && p.name === name) || null;
  }, [selectedPodKey, pods]);

  // Fetch Container Logs if the tab is active and a pod is selected
  const { 
    data: logs, 
    isLoading: logsLoading, 
    isError: logsError, 
    refetch: refetchLogs 
  } = usePodLogs(
    selectedPod?.namespace, 
    selectedPod?.name
  );

  // Extract unique namespaces
  const namespaces = useMemo(() => {
    if (!pods) return [];
    const set = new Set(pods.map((p) => p.namespace));
    return Array.from(set).sort();
  }, [pods]);

  // Extract unique phases
  const phases = useMemo(() => {
    if (!pods) return [];
    const set = new Set(pods.map((p) => p.phase));
    return Array.from(set).sort();
  }, [pods]);

  // Extract unique issueTypes
  const issues = useMemo(() => {
    if (!pods) return [];
    const set = new Set<string>();
    pods.forEach((p) => {
      if (p.issueType) set.add(p.issueType);
    });
    return Array.from(set).sort();
  }, [pods]);

  // Filtered Pods list
  const filteredPods = useMemo(() => {
    if (!pods) return [];
    return pods.filter((pod) => {
      const matchesSearch = pod.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesNs = selectedNamespace === "All" || pod.namespace === selectedNamespace;
      const matchesPhase = selectedPhase === "All" || pod.phase === selectedPhase;
      const matchesIssue = selectedIssue === "All" 
        ? true 
        : selectedIssue === "Healthy" 
        ? !pod.issueType 
        : pod.issueType === selectedIssue;
      
      return matchesSearch && matchesNs && matchesPhase && matchesIssue;
    });
  }, [pods, searchTerm, selectedNamespace, selectedPhase, selectedIssue]);

  // Handle Manual Heal Request
  const handleHeal = async () => {
    if (!selectedPod || !token || !activeClusterId) return;
    setIsHealing(true);
    setHealMessage(null);
    try {
      await triggerManualPodHeal(token, activeClusterId, selectedPod.namespace, selectedPod.name);
      setHealMessage({
        type: "success",
        text: `Manual healing request triggered for ${selectedPod.name} successfully!`
      });
      // Refetch pods to see active healing indicators
      refetch();
    } catch (err) {
      setHealMessage({
        type: "error",
        text: parseApiErrorMessage(err)
      });
    } finally {
      setIsHealing(false);
    }
  };

  // Render Skeletons
  function renderSkeletons() {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-muted p-5 space-y-4 bg-card shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-4/5 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Get color styles for Pod Phase & Issues
  const getPodColors = (pod: PodSummary) => {
    if (pod.issueType || pod.phase === "Failed") {
      return {
        bg: "bg-red-50/50 dark:bg-red-950/10",
        border: "border-red-150 dark:border-red-900/30 hover:border-red-300 dark:hover:border-red-700/50",
        selectedBorder: "border-red-500 dark:border-red-500 ring-2 ring-red-500/20",
        dot: "bg-red-500 ring-red-500/20",
        text: "text-red-700 dark:text-red-400",
        badge: "bg-red-100/70 text-red-800 dark:bg-red-950/55 dark:text-red-300",
      };
    }
    if (pod.phase === "Pending" || pod.phase === "Unknown") {
      return {
        bg: "bg-blue-50/50 dark:bg-blue-950/10",
        border: "border-blue-150 dark:border-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700/50",
        selectedBorder: "border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20",
        dot: "bg-blue-500 ring-blue-500/20",
        text: "text-blue-700 dark:text-blue-400",
        badge: "bg-blue-100/70 text-blue-800 dark:bg-blue-950/55 dark:text-blue-300",
      };
    }
    if (pod.phase === "Running" || pod.phase === "Succeeded") {
      return {
        bg: "bg-green-50/50 dark:bg-green-950/10",
        border: "border-green-150 dark:border-green-900/30 hover:border-green-300 dark:hover:border-green-700/50",
        selectedBorder: "border-green-500 dark:border-green-500 ring-2 ring-green-500/20",
        dot: "bg-green-500 ring-green-500/20",
        text: "text-green-700 dark:text-green-400",
        badge: "bg-green-100/70 text-green-800 dark:bg-green-950/55 dark:text-green-300",
      };
    }
    return {
      bg: "bg-muted/10",
      border: "border-muted hover:border-muted-foreground/35",
      selectedBorder: "border-muted-foreground ring-2 ring-muted-foreground/20",
      dot: "bg-muted-foreground/60 ring-muted-foreground/15",
      text: "text-muted-foreground",
      badge: "bg-muted text-muted-foreground",
    };
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Topbar title="Pods" />

      <div className="flex-1 p-5 md:p-6 space-y-6">
        
        {/* Toolbar & Filters Column */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Active Workload Pods</h2>
              <p className="text-sm text-muted-foreground">
                Inspect container execution states, review live workloads logs, and run manual auto-heals.
              </p>
            </div>
            {activeClusterId && (
              <button
                onClick={() => refetch()}
                disabled={isLoading || isFetching}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-all duration-150 disabled:opacity-50"
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>{isFetching ? "Refreshing..." : "Refresh"}</span>
              </button>
            )}
          </div>

          {/* Filters Bar Card */}
          {activeClusterId && !isError && !isLoading && (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                
                {/* Search Term */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/75" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search pods by name..."
                    className="w-full pl-9 pr-4 py-2 border rounded-lg bg-background text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/25 transition-all"
                  />
                </div>

                {/* Namespace Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Namespace:
                  </span>
                  <select
                    value={selectedNamespace}
                    onChange={(e) => setSelectedNamespace(e.target.value)}
                    className="border rounded-lg bg-background px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="All">All Namespaces</option>
                    {namespaces.map((ns) => (
                      <option key={ns} value={ns}>{ns}</option>
                    ))}
                  </select>
                </div>

                {/* Phase Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold">Phase:</span>
                  <select
                    value={selectedPhase}
                    onChange={(e) => setSelectedPhase(e.target.value)}
                    className="border rounded-lg bg-background px-3 py-1.5 text-xs focus:outline-hidden"
                  >
                    <option value="All">All Phases</option>
                    {phases.map((ph) => (
                      <option key={ph} value={ph}>{ph}</option>
                    ))}
                  </select>
                </div>

                {/* Issue Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold">Issues:</span>
                  <select
                    value={selectedIssue}
                    onChange={(e) => setSelectedIssue(e.target.value)}
                    className="border rounded-lg bg-background px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500/25"
                  >
                    <option value="All">All States</option>
                    <option value="Healthy">Healthy (No active issue)</option>
                    {issues.map((iss) => (
                      <option key={iss} value={iss}>{iss}</option>
                    ))}
                  </select>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Global Cluster State */}
        {!activeClusterId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:bg-amber-950/10 dark:border-amber-900/30">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-950 dark:text-amber-300">No active cluster selected</h4>
                <p className="text-sm text-amber-800/80 dark:text-amber-400/80 mt-1">
                  Please select a connected cluster from the sidebar, or navigate to{" "}
                  <a href="/dashboard/clusters" className="font-semibold underline">
                    Clusters
                  </a>{" "}
                  to connect your local or cloud infrastructure.
                </p>
              </div>
            </div>
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:bg-red-950/10 dark:border-red-900/30">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-950 dark:text-red-300">Cluster API unreachable</h4>
                <p className="text-sm text-red-800/80 dark:text-red-400/80 mt-1">
                  We could not fetch Kubernetes pod list details. Check your agent configuration, verify that the 
                  Kubernetes cluster is up, and click **Refresh** to retry.
                </p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          renderSkeletons()
        ) : !pods || pods.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl p-12 text-center bg-card">
            <Server className="h-10 w-10 text-muted-foreground mb-4 opacity-40 animate-pulse" />
            <h3 className="font-semibold text-base">No Pods Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              No Kubernetes pods were returned for the active connection. Check your kubeconfig permissions.
            </p>
          </div>
        ) : filteredPods.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl p-12 text-center bg-card">
            <Filter className="h-10 w-10 text-muted-foreground mb-4 opacity-30" />
            <h3 className="font-semibold text-base">No Matching Pods</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Your filter configuration did not yield any matching pods. Try loosening your search criteria.
            </p>
          </div>
        ) : (
          /* Main Layout: Split list vs Selection pane */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left pods list / grid */}
            <div className={`space-y-4 transition-all duration-300 ${
              selectedPodKey ? "lg:col-span-4" : "lg:col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 space-y-0"
            }`}>
              {filteredPods.map((pod) => {
                const colors = getPodColors(pod);
                const podKeyStr = `${pod.namespace}/${pod.name}`;
                const isSelected = selectedPodKey === podKeyStr;

                return (
                  <div
                    key={podKeyStr}
                    onClick={() => {
                      setSelectedPodKey(isSelected ? null : podKeyStr);
                      setHealMessage(null);
                    }}
                    className={`group cursor-pointer rounded-xl border p-5 transition-all duration-200 bg-card hover:shadow-md ${colors.bg} ${
                      isSelected ? colors.selectedBorder : colors.border
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="relative mt-0.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-2xs group-hover:scale-105 transition-transform duration-200">
                            <Server className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <span className={`absolute -top-1 -right-1 flex h-3 w-3 rounded-full ring-2 ring-background ${colors.dot}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm tracking-tight break-all">
                            {pod.name}
                          </h3>
                          <p className="text-3xs text-muted-foreground font-mono mt-0.5">
                            Namespace: {pod.namespace}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {pod.issueType && (
                              <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 uppercase tracking-wide">
                                {pod.issueType}
                              </span>
                            )}
                            {pod.hasActiveHeal && (
                              <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-semibold bg-indigo-500 text-white animate-pulse uppercase tracking-wide">
                                Healing...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold ${colors.badge}`}>
                          {pod.phase}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>

                    {/* Resources specs details */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-muted/50 mt-4 text-xs font-mono">
                      <div>
                        <span className="text-4xs text-muted-foreground uppercase tracking-wider block font-sans font-semibold">Restarts</span>
                        <span className="text-xs font-semibold text-foreground">{pod.restartCount}</span>
                      </div>
                      <div>
                        <span className="text-4xs text-muted-foreground uppercase tracking-wider block font-sans font-semibold">Ready Checks</span>
                        <span className={`text-xs font-semibold ${pod.ready ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {pod.ready ? "Passing" : "Failing / Not Ready"}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Right selection details panel */}
            <div className={`lg:col-span-8 border rounded-2xl bg-card/60 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-300 ${
              selectedPodKey ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 lg:hidden pointer-events-none"
            }`}>
              {selectedPod && (
                <div className="flex flex-col">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/40">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border">
                        <Server className="h-4.5 w-4.5 text-foreground" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm break-all">{selectedPod.name}</h3>
                        <p className="text-3xs text-muted-foreground font-mono">
                          Namespace: {selectedPod.namespace}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleHeal}
                        disabled={isHealing || selectedPod.hasActiveHeal}
                        className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm"
                      >
                        {isHealing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Activity className="h-3 w-3" />
                        )}
                        <span>{selectedPod.hasActiveHeal ? "Healing..." : isHealing ? "Triggering..." : "Heal Pod"}</span>
                      </button>
                      <button
                        onClick={() => setSelectedPodKey(null)}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Panel Tabs Navigation */}
                  <div className="flex border-b bg-muted/20 px-5 text-xs font-medium">
                    <button
                      onClick={() => setActiveTab("spec")}
                      className={`py-3 px-4 border-b-2 -mb-[2px] transition-all duration-150 ${
                        activeTab === "spec" 
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold" 
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Specifications
                    </button>
                    <button
                      onClick={() => setActiveTab("logs")}
                      className={`py-3 px-4 border-b-2 -mb-[2px] transition-all duration-150 flex items-center space-x-1.5 ${
                        activeTab === "logs" 
                          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold" 
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      <span>Live Container Logs</span>
                    </button>
                  </div>

                  {/* Panel Body */}
                  <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-16rem)]">
                    
                    {/* Feedback Messages */}
                    {healMessage && (
                      <div className={`rounded-xl border p-4 text-xs font-medium ${
                        healMessage.type === "success"
                          ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/15 dark:border-green-900/30 dark:text-green-300"
                          : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/15 dark:border-red-900/30 dark:text-red-300"
                      }`}>
                        <p>{healMessage.text}</p>
                      </div>
                    )}

                    {/* Spec Tab Content */}
                    {activeTab === "spec" && (
                      <div className="space-y-6">
                        
                        {/* Status Alert Banner */}
                        <div className={`rounded-xl border p-4 flex items-center space-x-4 ${getPodColors(selectedPod).bg} ${getPodColors(selectedPod).border}`}>
                          <div className="relative">
                            <span className={`flex h-4 w-4 rounded-full ring-4 ring-background ${getPodColors(selectedPod).dot}`} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">Pod Lifecycle: {selectedPod.phase}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {selectedPod.issueType 
                                ? `Critical issue identified: "${selectedPod.issueType}". Use the manual Heal Pod button to fix OOM constraints, clear image cache loops, or repair storage attachments.` 
                                : selectedPod.phase === "Running" 
                                ? "Workload is active, responsive, and all Kubelet ready probes are passing perfectly." 
                                : `Pod execution state is currently in "${selectedPod.phase}".`}
                            </p>
                          </div>
                        </div>

                        {/* Specs cards */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                            <Cpu className="h-3.5 w-3.5" />
                            <span>Physical Specifications</span>
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="rounded-xl border p-4 bg-muted/20 space-y-1">
                              <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">Restart Count</span>
                              <p className="text-lg font-bold tracking-tight text-foreground">{selectedPod.restartCount}</p>
                              <p className="text-4xs text-muted-foreground font-mono">Restarts since scheduling</p>
                            </div>
                            <div className="rounded-xl border p-4 bg-muted/20 space-y-1">
                              <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">Readiness Checks</span>
                              <p className={`text-base font-bold tracking-tight ${selectedPod.ready ? "text-green-600 dark:text-green-400" : "text-amber-500"}`}>
                                {selectedPod.ready ? "All Checks Passing" : "Checks Failing"}
                              </p>
                              <p className="text-4xs text-muted-foreground font-mono">Pod status ready: {selectedPod.ready ? "true" : "false"}</p>
                            </div>
                          </div>
                        </div>

                        {/* Kubernetes Metadata Specs */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Kubernetes Metadata</span>
                          </h4>
                          <div className="rounded-xl border divide-y divide-muted bg-muted/10 font-mono text-3xs">
                            <div className="flex items-center justify-between p-3">
                              <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">Pod Name</span>
                              <span className="text-foreground max-w-[60%] text-right truncate" title={selectedPod.name}>
                                {selectedPod.name}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3">
                              <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">Namespace</span>
                              <span className="text-foreground">{selectedPod.namespace}</span>
                            </div>
                            <div className="flex items-center justify-between p-3">
                              <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">Active Issue type</span>
                              <span className={`text-foreground uppercase font-bold ${selectedPod.issueType ? "text-red-500" : "text-green-600 dark:text-green-400 font-normal"}`}>
                                {selectedPod.issueType ?? "None (Healthy)"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3">
                              <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">Auto-Healing active</span>
                              <span className={`text-foreground uppercase font-bold ${selectedPod.hasActiveHeal ? "text-indigo-500" : "text-muted-foreground/60 font-normal"}`}>
                                {selectedPod.hasActiveHeal ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Logs Tab Content */}
                    {activeTab === "logs" && (
                      <div className="space-y-4 flex flex-col min-h-[300px]">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                            <Terminal className="h-3.5 w-3.5" />
                            <span>Stdout / Stderr Streams (Recent 100 Lines)</span>
                          </h4>
                          <button
                            onClick={() => refetchLogs()}
                            className="inline-flex items-center space-x-1 text-2xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Refresh Logs</span>
                          </button>
                        </div>

                        {/* Logs screen terminal */}
                        <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300 overflow-y-auto max-h-[400px] shadow-inner select-text">
                          {logsLoading ? (
                            <div className="flex items-center justify-center py-12 space-x-2 text-zinc-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Fetching stdout logs stream...</span>
                            </div>
                          ) : logsError ? (
                            <div className="flex items-start space-x-2 py-4 text-red-400">
                              <AlertTriangle className="h-4 w-4 mt-0.5" />
                              <div>
                                <p className="font-semibold">Failed to load container logs</p>
                                <p className="text-2xs text-red-500/80 mt-0.5">
                                  Verify pod status, confirm kubelet endpoint reachability, and refresh to try again.
                                </p>
                              </div>
                            </div>
                          ) : !logs || logs.trim() === "" ? (
                            <p className="text-zinc-600 italic">Logs are empty. No standard output stream received.</p>
                          ) : (
                            <pre className="whitespace-pre-wrap leading-relaxed break-words font-mono">
                              {logs}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
