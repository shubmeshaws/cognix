"use client";

import { useState, useMemo } from "react";
import { 
  Server, 
  Cpu, 
  Database, 
  Activity, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Network, 
  ChevronRight, 
  RefreshCw, 
  Loader2, 
  X,
  Search,
  Filter
} from "lucide-react";


import { useClusterStore } from "@/stores/cluster";
import { useNodes } from "@/lib/query";
import type { NodeSummary, NodeCondition } from "@/types/api";

export default function NodesPage() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const { data: nodes, isLoading, isError, refetch, isFetching } = useNodes();
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("All");
  const [selectedHealth, setSelectedHealth] = useState("All");

  const selectedNode = nodes?.find((n) => n.name === selectedNodeName) || null;

  // Extract unique roles from nodes
  const roles = useMemo(() => {
    if (!nodes) return [];
    const set = new Set<string>();
    nodes.forEach((n) => {
      n.roles.forEach((r) => set.add(r));
    });
    return Array.from(set).sort();
  }, [nodes]);

  // Filtered Nodes list
  const filteredNodes = useMemo(() => {
    if (!nodes) return [];
    return nodes.filter((node) => {
      const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = selectedRole === "All" || node.roles.includes(selectedRole);
      const matchesHealth = selectedHealth === "All"
        ? true
        : selectedHealth === "green"
        ? node.color === "green"
        : selectedHealth === "red"
        ? node.color === "red"
        : node.color === "blue";
        
      return matchesSearch && matchesRole && matchesHealth;
    });
  }, [nodes, searchTerm, selectedRole, selectedHealth]);

  // Render Loading Skeleton
  function renderSkeletons() {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-muted p-5 space-y-4 bg-card shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Color mapper helper functions
  const getColorStyles = (color: NodeSummary["color"]) => {
    switch (color) {
      case "green":
        return {
          bg: "bg-green-50/50 dark:bg-green-950/10",
          border: "border-green-150 dark:border-green-900/30 hover:border-green-300 dark:hover:border-green-700/50",
          selectedBorder: "border-green-500 dark:border-green-500 ring-2 ring-green-500/20",
          dot: "bg-green-500 ring-green-500/20",
          text: "text-green-700 dark:text-green-400",
          badge: "bg-green-100/70 text-green-800 dark:bg-green-950/55 dark:text-green-300",
        };
      case "red":
        return {
          bg: "bg-red-50/50 dark:bg-red-950/10",
          border: "border-red-150 dark:border-red-900/30 hover:border-red-300 dark:hover:border-red-700/50",
          selectedBorder: "border-red-500 dark:border-red-500 ring-2 ring-red-500/20",
          dot: "bg-red-500 ring-red-500/20",
          text: "text-red-700 dark:text-red-400",
          badge: "bg-red-100/70 text-red-800 dark:bg-red-950/55 dark:text-red-300",
        };
      case "blue":
      default:
        return {
          bg: "bg-blue-50/50 dark:bg-blue-950/10",
          border: "border-blue-150 dark:border-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700/50",
          selectedBorder: "border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20",
          dot: "bg-blue-500 ring-blue-500/20",
          text: "text-blue-700 dark:text-blue-400",
          badge: "bg-blue-100/70 text-blue-800 dark:bg-blue-950/55 dark:text-blue-300",
        };
    }
  };

  const getConditionColor = (cond: NodeCondition) => {
    if (cond.type === "Ready") {
      return cond.status === "True" ? "green" : cond.status === "False" ? "red" : "blue";
    }
    // Pressure conditions are bad when "True"
    return cond.status === "True" ? "red" : cond.status === "False" ? "green" : "blue";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex-1 p-5 md:p-6 space-y-6">
        {/* Header Action & Status Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Cluster Infrastructure Nodes</h2>
            <p className="text-sm text-muted-foreground">
              Monitor node health, capacity allocations, and systemic conditions.
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
        {activeClusterId && !isError && !isLoading && nodes && nodes.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center gap-4">

              {/* Search Term */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/75" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search nodes by name..."
                  className="w-full pl-9 pr-4 py-2 border rounded-lg bg-background text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/25 transition-all"
                />
              </div>

              {/* Role Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                  <Filter className="h-3 w-3" />
                  Role:
                </span>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="border rounded-lg bg-background px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="All">All Roles</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              {/* Health Status Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold">Health:</span>
                <select
                  value={selectedHealth}
                  onChange={(e) => setSelectedHealth(e.target.value)}
                  className="border rounded-lg bg-background px-3 py-1.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="All">All Statuses</option>
                  <option value="green">🟢 Healthy (Ready)</option>
                  <option value="red">🔴 Issues (Pressure / NotReady)</option>
                  <option value="blue">🔵 Pending / Unknown</option>
                </select>
              </div>

            </div>
          </div>
        )}

        {/* Global Cluster selection status / Error state */}
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
                  We could not fetch Kubernetes node metrics. Check your agent configuration, verify that the 
                  Kubernetes cluster is up, and click **Refresh** to retry.
                </p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          renderSkeletons()
        ) : !nodes || nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl p-12 text-center bg-card">
            <Server className="h-10 w-10 text-muted-foreground mb-4 opacity-40 animate-pulse" />
            <h3 className="font-semibold text-base">No Nodes Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              No Kubernetes nodes were returned for the active connection. Check your kubeconfig permissions.
            </p>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl p-12 text-center bg-card">
            <Filter className="h-10 w-10 text-muted-foreground mb-4 opacity-30" />
            <h3 className="font-semibold text-base">No Matching Nodes</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Your filter configuration did not yield any matching nodes. Try loosening your search criteria.
            </p>
          </div>
        ) : (
          /* Main Layout: Split list vs selection pane */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left nodes list / grid */}
            <div className={`space-y-4 transition-all duration-300 ${
              selectedNodeName ? "lg:col-span-4" : "lg:col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 space-y-0"
            }`}>
              {filteredNodes.map((node) => {
                const styles = getColorStyles(node.color);
                const isSelected = selectedNodeName === node.name;

                return (
                  <div
                    key={node.name}
                    onClick={() => setSelectedNodeName(isSelected ? null : node.name)}
                    className={`group cursor-pointer rounded-xl border p-5 transition-all duration-200 bg-card hover:shadow-md ${styles.bg} ${
                      isSelected ? styles.selectedBorder : styles.border
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-2xs group-hover:scale-105 transition-transform duration-200">
                            <Server className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <span className={`absolute -top-1 -right-1 flex h-3 w-3 rounded-full ring-2 ring-background ${styles.dot}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm tracking-tight break-all">
                            {node.name}
                          </h3>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {node.roles.map((role) => (
                              <span
                                key={role}
                                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-medium bg-muted text-muted-foreground uppercase tracking-wider"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold ${styles.badge}`}>
                          {node.status}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>

                    {/* Resources capacity overview */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-muted/50 mt-4 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-muted-foreground text-3xs uppercase tracking-wider font-semibold">
                          <span className="flex items-center space-x-1">
                            <Cpu className="h-3 w-3 text-muted-foreground/60" />
                            <span>CPU Allocatable</span>
                          </span>
                          <span>{node.cpuAllocatable} / {node.cpuCapacity}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-1.5 rounded-full" 
                            style={{ 
                              width: `${
                                isNaN(parseFloat(node.cpuAllocatable)) || isNaN(parseFloat(node.cpuCapacity))
                                  ? 100 
                                  : (parseFloat(node.cpuAllocatable) / parseFloat(node.cpuCapacity)) * 100
                              }%` 
                            }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-muted-foreground text-3xs uppercase tracking-wider font-semibold">
                          <span className="flex items-center space-x-1">
                            <Database className="h-3 w-3 text-muted-foreground/60" />
                            <span>Memory Allocatable</span>
                          </span>
                        </div>
                        <div className="text-3xs text-muted-foreground truncate font-medium">
                          {node.memoryAllocatable} of {node.memoryCapacity}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right selection details panel */}
            <div className={`lg:col-span-8 border rounded-2xl bg-card/60 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-300 ${
              selectedNodeName ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 lg:hidden pointer-events-none"
            }`}>
              {selectedNode && (
                <div className="flex flex-col">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/40">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border">
                        <Server className="h-4.5 w-4.5 text-foreground" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm break-all">{selectedNode.name}</h3>
                        <p className="text-3xs text-muted-foreground font-mono">
                          Created {selectedNode.createdAt ? new Date(selectedNode.createdAt).toLocaleDateString() : "unknown"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedNodeName(null)}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  {/* Panel Body */}
                  <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-14rem)]">
                    
                    {/* Status Overview Card */}
                    <div className={`rounded-xl border p-4 flex items-center space-x-4 ${getColorStyles(selectedNode.color).bg} ${getColorStyles(selectedNode.color).border}`}>
                      <div className="relative">
                        <span className={`flex h-4 w-4 rounded-full ring-4 ring-background ${getColorStyles(selectedNode.color).dot}`} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">Node Status: {selectedNode.status}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedNode.color === "green" 
                            ? "All checks are passing. The node is actively processing scheduled workloads." 
                            : selectedNode.color === "red" 
                            ? "This node has outstanding critical conditions or has active pressure states."
                            : "Status is unknown or pending connection verification."}
                        </p>
                      </div>
                    </div>

                    {/* Resources Allocatable Spec */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                        <Activity className="h-3.5 w-3.5" />
                        <span>Allocatable Resources</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl border p-4 bg-muted/20 space-y-1">
                          <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">CPU Allocatable</span>
                          <p className="text-lg font-bold tracking-tight text-foreground">{selectedNode.cpuAllocatable}</p>
                          <p className="text-4xs text-muted-foreground font-mono">Capacity: {selectedNode.cpuCapacity}</p>
                        </div>
                        <div className="rounded-xl border p-4 bg-muted/20 space-y-1">
                          <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">Memory Allocatable</span>
                          <p className="text-xs font-bold tracking-tight text-foreground truncate">{selectedNode.memoryAllocatable}</p>
                          <p className="text-4xs text-muted-foreground font-mono truncate">Capacity: {selectedNode.memoryCapacity}</p>
                        </div>
                      </div>
                    </div>

                    {/* Conditions Section */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                        <Activity className="h-3.5 w-3.5 animate-pulse" />
                        <span>Systemic Conditions</span>
                      </h4>
                      <div className="space-y-2">
                        {selectedNode.conditions.map((cond) => {
                          const condColor = getConditionColor(cond);
                          const isNormal = condColor === "green";
                          const isIssue = condColor === "red";
                          
                          return (
                            <div 
                              key={cond.type} 
                              className={`rounded-xl border p-3.5 flex items-start space-x-3 transition-colors ${
                                isIssue 
                                  ? "bg-red-50/40 border-red-200/50 dark:bg-red-950/10 dark:border-red-900/30" 
                                  : isNormal 
                                  ? "bg-green-50/20 border-green-150/40 dark:bg-green-950/5 dark:border-green-900/20" 
                                  : "bg-blue-50/20 border-blue-150/40 dark:bg-blue-950/5 dark:border-blue-900/20"
                              }`}
                            >
                              <div className="mt-0.5">
                                {isNormal ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : isIssue ? (
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                ) : (
                                  <Info className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-xs text-foreground">{cond.type}</span>
                                  <span className={`text-4xs font-bold uppercase px-1.5 py-0.5 rounded-md ${
                                    isIssue 
                                      ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400" 
                                      : isNormal
                                      ? "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400"
                                      : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400"
                                  }`}>
                                    {cond.status === "True" ? "Active" : cond.status === "False" ? "Inactive" : cond.status}
                                  </span>
                                </div>
                                {(cond.reason || cond.message) && (
                                  <div className="mt-1 text-3xs text-muted-foreground leading-relaxed break-words">
                                    {cond.reason && <span className="font-semibold text-foreground/80">{cond.reason}: </span>}
                                    {cond.message}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Network Addresses */}
                    {selectedNode.addresses.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                          <Network className="h-3.5 w-3.5" />
                          <span>Node Addresses</span>
                        </h4>
                        <div className="rounded-xl border divide-y divide-muted bg-muted/10">
                          {selectedNode.addresses.map((addr, idx) => (
                            <div key={`${addr.type}-${addr.address}-${idx}`} className="flex items-center justify-between p-3 text-xs">
                              <span className="text-muted-foreground text-3xs uppercase tracking-wider font-semibold">{addr.type}</span>
                              <span className="font-mono font-medium text-foreground">{addr.address}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Node Metadata Specs */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>System Details</span>
                      </h4>
                      <div className="rounded-xl border divide-y divide-muted bg-muted/10 font-mono text-3xs">
                        <div className="flex items-center justify-between p-3">
                          <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">OS Image</span>
                          <span className="text-foreground max-w-[60%] text-right truncate" title={selectedNode.osImage}>
                            {selectedNode.osImage}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3">
                          <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">Kubelet Version</span>
                          <span className="text-foreground">{selectedNode.kubeletVersion}</span>
                        </div>
                        <div className="flex items-center justify-between p-3">
                          <span className="text-muted-foreground font-sans font-semibold uppercase tracking-wider">OS / Architecture</span>
                          <span className="text-foreground uppercase">{selectedNode.operatingSystem} / {selectedNode.architecture}</span>
                        </div>
                      </div>
                    </div>

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
