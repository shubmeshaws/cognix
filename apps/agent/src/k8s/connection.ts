import type { ClusterConfig } from "@kubehealer/shared";
import {
  ADD,
  ApiException,
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  CustomObjectsApi,
  DELETE,
  KubeConfig,
  makeInformer,
  PatchStrategy,
  setHeaderOptions,
  UPDATE,
  VersionApi,
  Metrics,
  type CoreV1Event,
  type V1Container,
  type V1Deployment,
  type V1Pod,
  type V1ReplicaSet,
  type V1Scale,
  type V1StatefulSet,
  type V1Node,
} from "@kubernetes/client-node";
import { bumpMemoryLimit } from "../healer/memory.js";
import { raceTimeout } from "../lib/timeout.js";
import { AuthError, ConnectionError } from "./errors.js";
import { withRetry } from "./retry.js";
import {
  KEDA_SCALEDJOB_LABEL,
  matchScaledJobName,
  type WorkloadRef,
} from "./workload.js";

const NAMESPACE_LIST_TIMEOUT_MS = 2_500;

/** client-node defaults to JSON Patch; deployment patches need strategic merge. */
const STRATEGIC_MERGE_PATCH_OPTIONS = setHeaderOptions(
  "Content-Type",
  PatchStrategy.StrategicMergePatch,
);

export type InformerEventType = typeof ADD | typeof UPDATE | typeof DELETE;

export interface K8sClients {
  kubeConfig: KubeConfig;
  core: CoreV1Api;
  apps: AppsV1Api;
  batch: BatchV1Api;
  custom: CustomObjectsApi;
  version: VersionApi;
}

export interface WorkloadMemoryPatchResult {
  workload: WorkloadRef;
  containerName: string;
  currentLimit: string;
  newLimit: string;
}

const KEDA_SCALEDJOB_GROUP = "keda.sh";
const KEDA_SCALEDJOB_VERSION = "v1alpha1";
const KEDA_SCALEDJOB_PLURAL = "scaledjobs";

interface ConnectionLogger {
  info(obj: object, msg?: string): void;
  debug?(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface ClusterConnectionOptions {
  clients?: K8sClients;
  log?: ConnectionLogger;
}

function getStatusCode(err: unknown): number | undefined {
  if (err instanceof ApiException) return err.code;
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

function decodeKubeconfig(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Max namespaces to list/watch when no filter is set (keeps local clusters fast). */
export const MAX_WATCH_NAMESPACES = 20;

function createClients(kubeConfig: KubeConfig): K8sClients {
  return {
    kubeConfig,
    core: kubeConfig.makeApiClient(CoreV1Api),
    apps: kubeConfig.makeApiClient(AppsV1Api),
    batch: kubeConfig.makeApiClient(BatchV1Api),
    custom: kubeConfig.makeApiClient(CustomObjectsApi),
    version: kubeConfig.makeApiClient(VersionApi),
  };
}

function firstContainer(
  containers: V1Container[] | undefined,
): V1Container | undefined {
  return containers?.[0];
}

function containerMemory(
  container: V1Container | undefined,
): { name: string; limit: string; request?: string } {
  const name = container?.name ?? "app";
  const limit = container?.resources?.limits?.memory ?? "256Mi";
  const request = container?.resources?.requests?.memory;
  return { name, limit, request };
}

export class ClusterConnection {
  private readonly config: ClusterConfig;
  private readonly log: ConnectionLogger | undefined;
  private clients: K8sClients | null;

  constructor(clusterConfig: ClusterConfig, options: ClusterConnectionOptions = {}) {
    this.config = clusterConfig;
    this.log = options.log;
    this.clients = options.clients ?? null;
  }

  connect(): void {
    if (this.clients) return;

    const kubeConfig = new KubeConfig();

    if (this.config.kubeconfigBase64) {
      const yaml = decodeKubeconfig(this.config.kubeconfigBase64);
      kubeConfig.loadFromString(yaml);
    } else if (this.config.inCluster) {
      kubeConfig.loadFromCluster();
    } else {
      throw new ConnectionError(
        `Cluster ${this.config.id}: provide kubeconfigBase64 or inCluster=true`,
      );
    }

    if (this.config.context) {
      kubeConfig.setCurrentContext(this.config.context);
    }

    this.clients = createClients(kubeConfig);
    this.log?.info({ clusterId: this.config.id }, "kubernetes client connected");
  }

  private requireClients(): K8sClients {
    if (!this.clients) {
      throw new ConnectionError(
        `Cluster ${this.config.id}: call connect() before using the API`,
      );
    }
    return this.clients;
  }

  private async invoke<T>(fn: () => Promise<T>): Promise<T | null> {
    return withRetry(async () => {
      try {
        return await fn();
      } catch (err) {
        const status = getStatusCode(err);
        if (status === 401 || status === 403) {
          this.log?.error(
            { clusterId: this.config.id, status },
            "kubernetes auth failed",
          );
          throw new AuthError(
            status,
            `Cluster ${this.config.id}: unauthorized (${status})`,
          );
        }
        if (status === 404) {
          return null;
        }
        throw err;
      }
    });
  }

  private resolveNamespaces(namespace?: string): string[] | "all" {
    if (namespace) return [namespace];
    if (this.config.namespaceFilter?.length) {
      return this.config.namespaceFilter;
    }
    return "all";
  }

  async listPods(namespace?: string): Promise<V1Pod[] | null> {
    const { core } = this.requireClients();
    const targets = this.resolveNamespaces(namespace);

    if (targets === "all") {
      const result = await this.invoke(() =>
        core.listPodForAllNamespaces({}),
      );
      return result?.items ?? null;
    }

    const pods: V1Pod[] = [];
    for (const ns of targets) {
      const result = await this.invoke(() => core.listNamespacedPod({ namespace: ns }));
      if (result === null) return null;
      pods.push(...(result.items ?? []));
    }
    return pods;
  }

  /** Bounded list for dashboard seeding — avoids hanging on huge clusters. */
  async listPodsWithTimeout(timeoutMs: number): Promise<V1Pod[] | null> {
    try {
      return await Promise.race([
        this.listPods(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`listPods timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } catch (err) {
      this.log?.error(
        { clusterId: this.config.id, err },
        "listPodsWithTimeout failed",
      );
      return null;
    }
  }

  async getPodLogs(
    name: string,
    ns: string,
    previous = false,
    tailLines = 80,
  ): Promise<string | null> {
    const { core } = this.requireClients();
    const read = (usePrevious: boolean) =>
      this.invoke(() =>
        core.readNamespacedPodLog({
          name,
          namespace: ns,
          previous: usePrevious,
          tailLines,
        }),
      );

    if (previous) {
      try {
        const prev = await read(true);
        if (prev) return prev;
      } catch (err) {
        const status = getStatusCode(err);
        const msg = err instanceof Error ? err.message : "";
        const noPrevContainer =
          status === 400 &&
          msg.includes("previous terminated container") &&
          msg.includes("not found");
        if (!noPrevContainer) throw err;
        this.log?.debug?.(
          { pod: name, namespace: ns },
          "previous container logs unavailable — using current container",
        );
      }
    }

    return read(false);
  }

  async getPodEvents(
    podName: string,
    namespace: string,
  ): Promise<CoreV1Event[] | null> {
    const { core } = this.requireClients();
    const fieldSelector = `involvedObject.name=${podName},involvedObject.kind=Pod`;
    const result = await this.invoke(() =>
      core.listNamespacedEvent({ namespace, fieldSelector }),
    );
    return result?.items ?? null;
  }

  async getEvents(namespace?: string): Promise<CoreV1Event[] | null> {
    const { core } = this.requireClients();
    const targets = this.resolveNamespaces(namespace);

    if (targets === "all") {
      const result = await this.invoke(() =>
        core.listEventForAllNamespaces({}),
      );
      return result?.items ?? null;
    }

    const events: CoreV1Event[] = [];
    for (const ns of targets) {
      const result = await this.invoke(() =>
        core.listNamespacedEvent({ namespace: ns }),
      );
      if (result === null) return null;
      events.push(...(result.items ?? []));
    }
    return events;
  }

  async patchDeployment(
    name: string,
    ns: string,
    patch: object,
  ): Promise<void | null> {
    const { apps } = this.requireClients();
    return this.invoke(() =>
      apps.patchNamespacedDeployment(
        { name, namespace: ns, body: patch },
        STRATEGIC_MERGE_PATCH_OPTIONS,
      ),
    ).then((r) => (r === null ? null : undefined));
  }

  async rolloutRestart(name: string, ns: string): Promise<void | null> {
    const restartedAt = new Date().toISOString();
    return this.patchDeployment(name, ns, {
      spec: {
        template: {
          metadata: {
            annotations: {
              "kubectl.kubernetes.io/restartedAt": restartedAt,
            },
          },
        },
      },
    });
  }

  async deletePod(name: string, ns: string): Promise<void | null> {
    const { core } = this.requireClients();
    return this.invoke(() =>
      core.deleteNamespacedPod({ name, namespace: ns }),
    ).then((r) => (r === null ? null : undefined));
  }

  async scaleDeployment(
    name: string,
    ns: string,
    replicas: number,
  ): Promise<void | null> {
    const { apps } = this.requireClients();
    const scale: V1Scale = {
      apiVersion: "autoscaling/v1",
      kind: "Scale",
      metadata: { name, namespace: ns },
      spec: { replicas },
    };
    return this.invoke(() =>
      apps.replaceNamespacedDeploymentScale({
        name,
        namespace: ns,
        body: scale,
      }),
    ).then((r) => (r === null ? null : undefined));
  }

  startInformer(
    namespace: string,
    onEvent: (type: InformerEventType, pod: V1Pod) => void,
  ): () => void {
    const { kubeConfig, core } = this.requireClients();

    const informer = makeInformer(
      kubeConfig,
      `/api/v1/namespaces/${namespace}/pods`,
      () => core.listNamespacedPod({ namespace }),
    );

    const handler = (type: InformerEventType) => (pod: V1Pod) => {
      onEvent(type, pod);
    };

    informer.on(ADD, handler(ADD));
    informer.on(UPDATE, handler(UPDATE));
    informer.on(DELETE, handler(DELETE));

    void informer.start().catch((err: unknown) => {
      this.log?.error({ err, clusterId: this.config.id }, "pod informer error");
    });

    return () => {
      void informer.stop();
    };
  }

  async listNamespaces(): Promise<string[] | null> {
    const { core } = this.requireClients();
    const result = await this.invoke(() => core.listNamespace({}));
    return result?.items?.map((ns) => ns.metadata?.name).filter(Boolean) as
      | string[]
      | null;
  }

  /** Namespaces for informers — capped unless namespaceFilter is set on the cluster. */
  async listNamespacesForWatch(): Promise<string[]> {
    const filter = this.config.namespaceFilter;
    if (filter?.length) return filter;

    const all =
      (await raceTimeout(this.listNamespaces(), NAMESPACE_LIST_TIMEOUT_MS, null)) ??
      [];
    const names = all.length ? all : ["default"];
    if (names.length <= MAX_WATCH_NAMESPACES) return names;

    const preferred = ["default", "kube-system", "kube-public", "kube-node-lease"];
    const picked = new Set<string>();
    for (const ns of preferred) {
      if (names.includes(ns)) picked.add(ns);
    }
    for (const ns of names) {
      if (picked.size >= MAX_WATCH_NAMESPACES) break;
      picked.add(ns);
    }
    return [...picked];
  }

  async readPod(name: string, namespace: string): Promise<V1Pod | null> {
    const { core } = this.requireClients();
    return this.invoke(() => core.readNamespacedPod({ name, namespace }));
  }

  async readDeployment(
    name: string,
    namespace: string,
  ): Promise<V1Deployment | null> {
    const { apps } = this.requireClients();
    return this.invoke(() =>
      apps.readNamespacedDeployment({ name, namespace }),
    );
  }

  async resolveDeploymentForPod(
    podName: string,
    namespace: string,
  ): Promise<string | null> {
    const workload = await this.resolveWorkloadForPod(podName, namespace);
    return workload?.kind === "Deployment" ? workload.name : null;
  }

  async resolveWorkloadForPod(
    podName: string,
    namespace: string,
  ): Promise<WorkloadRef | null> {
    const pod = await this.readPod(podName, namespace);
    if (!pod?.metadata) return null;

    const owners = pod.metadata.ownerReferences ?? [];

    const stsOwner = owners.find((o) => o.kind === "StatefulSet");
    if (stsOwner?.name) {
      return { kind: "StatefulSet", name: stsOwner.name, namespace };
    }

    const rsOwner = owners.find((o) => o.kind === "ReplicaSet");
    if (rsOwner?.name) {
      const { apps } = this.requireClients();
      const rs = await this.invoke(() =>
        apps.readNamespacedReplicaSet({ name: rsOwner.name, namespace }),
      );
      const deployOwner = rs?.metadata?.ownerReferences?.find(
        (o) => o.kind === "Deployment",
      );
      if (deployOwner?.name) {
        return { kind: "Deployment", name: deployOwner.name, namespace };
      }
    }

    const jobOwner = owners.find((o) => o.kind === "Job");
    if (jobOwner?.name) {
      const { batch } = this.requireClients();
      const job = await this.invoke(() =>
        batch.readNamespacedJob({ name: jobOwner.name, namespace }),
      );

      const cronOwner = job?.metadata?.ownerReferences?.find(
        (o) => o.kind === "CronJob",
      );
      if (cronOwner?.name) {
        return { kind: "CronJob", name: cronOwner.name, namespace };
      }

      const scaledFromLabels =
        pod.metadata.labels?.[KEDA_SCALEDJOB_LABEL] ??
        job?.metadata?.labels?.[KEDA_SCALEDJOB_LABEL];
      if (scaledFromLabels) {
        return { kind: "ScaledJob", name: scaledFromLabels, namespace };
      }

      const scaledJobs = await this.listScaledJobNames(namespace);
      let matched = matchScaledJobName(jobOwner.name, scaledJobs);
      if (!matched) {
        matched = inferScaledJobNameFromJob(jobOwner.name);
        if (matched && scaledJobs.length > 0 && !scaledJobs.includes(matched)) {
          matched = matchScaledJobName(jobOwner.name, scaledJobs) ?? matched;
        }
      }
      if (matched) {
        const exists = await this.readScaledJob(matched, namespace);
        if (exists) {
          return { kind: "ScaledJob", name: matched, namespace };
        }
      }

      return { kind: "Job", name: jobOwner.name, namespace };
    }

    return null;
  }

  async listScaledJobNames(namespace: string): Promise<string[]> {
    const { custom } = this.requireClients();
    try {
      const res = await this.invoke(() =>
        custom.listNamespacedCustomObject({
          group: KEDA_SCALEDJOB_GROUP,
          version: KEDA_SCALEDJOB_VERSION,
          namespace,
          plural: KEDA_SCALEDJOB_PLURAL,
        }),
      );
      const items = (res as { items?: Array<{ metadata?: { name?: string } }> })
        ?.items;
      return (items ?? [])
        .map((item) => item.metadata?.name)
        .filter((name): name is string => Boolean(name));
    } catch {
      return [];
    }
  }

  /** Latest memory usage from metrics-server (if installed). */
  async getPodContainerMemoryUsage(
    podName: string,
    namespace: string,
    containerName?: string,
  ): Promise<string | null> {
    if (!this.clients) return null;
    try {
      const metrics = new Metrics(this.clients.kubeConfig);
      const list = await metrics.getPodMetrics(namespace);
      const pod = list.items.find((item) => item.metadata.name === podName);
      if (!pod?.containers?.length) return null;
      const container = containerName
        ? pod.containers.find((c) => c.name === containerName)
        : pod.containers[0];
      const usage = container?.usage?.memory?.trim();
      return usage || null;
    } catch {
      return null;
    }
  }

  async readWorkloadMemory(
    ref: WorkloadRef,
  ): Promise<{ containerName: string; currentLimit: string; requestMemory?: string } | null> {
    switch (ref.kind) {
      case "Deployment": {
        const deploy = await this.readDeployment(ref.name, ref.namespace);
        const c = firstContainer(deploy?.spec?.template?.spec?.containers);
        const mem = containerMemory(c);
        return {
          containerName: mem.name,
          currentLimit: mem.limit,
          requestMemory: mem.request,
        };
      }
      case "StatefulSet": {
        const { apps } = this.requireClients();
        const sts = await this.invoke(() =>
          apps.readNamespacedStatefulSet({ name: ref.name, namespace: ref.namespace }),
        );
        const c = firstContainer(sts?.spec?.template?.spec?.containers);
        const mem = containerMemory(c);
        return {
          containerName: mem.name,
          currentLimit: mem.limit,
          requestMemory: mem.request,
        };
      }
      case "CronJob": {
        const { batch } = this.requireClients();
        const cj = await this.invoke(() =>
          batch.readNamespacedCronJob({ name: ref.name, namespace: ref.namespace }),
        );
        const c = firstContainer(
          cj?.spec?.jobTemplate?.spec?.template?.spec?.containers,
        );
        const mem = containerMemory(c);
        return {
          containerName: mem.name,
          currentLimit: mem.limit,
          requestMemory: mem.request,
        };
      }
      case "ScaledJob": {
        const sj = await this.readScaledJob(ref.name, ref.namespace);
        const c = firstContainer(
          (sj?.spec as { jobTargetRef?: { template?: { spec?: { containers?: V1Container[] } } } })
            ?.jobTargetRef?.template?.spec?.containers,
        );
        const mem = containerMemory(c);
        return {
          containerName: mem.name,
          currentLimit: mem.limit,
          requestMemory: mem.request,
        };
      }
      case "Job": {
        const { batch } = this.requireClients();
        const job = await this.invoke(() =>
          batch.readNamespacedJob({ name: ref.name, namespace: ref.namespace }),
        );
        const c = firstContainer(job?.spec?.template?.spec?.containers);
        const mem = containerMemory(c);
        return {
          containerName: mem.name,
          currentLimit: mem.limit,
          requestMemory: mem.request,
        };
      }
      default:
        return null;
    }
  }

  async patchWorkloadMemory(
    ref: WorkloadRef,
    containerName: string,
    newLimit: string,
    requestMemory: string,
  ): Promise<boolean> {
    const resourcesPatch = {
      limits: { memory: newLimit },
      requests: { memory: requestMemory },
    };

    switch (ref.kind) {
      case "Deployment":
        await this.patchDeployment(ref.name, ref.namespace, {
          spec: {
            template: {
              spec: {
                containers: [{ name: containerName, resources: resourcesPatch }],
              },
            },
          },
        });
        return true;
      case "StatefulSet": {
        const { apps } = this.requireClients();
        await this.invoke(() =>
          apps.patchNamespacedStatefulSet(
            {
              name: ref.name,
              namespace: ref.namespace,
              body: {
                spec: {
                  template: {
                    spec: {
                      containers: [
                        { name: containerName, resources: resourcesPatch },
                      ],
                    },
                  },
                },
              },
            },
            STRATEGIC_MERGE_PATCH_OPTIONS,
          ),
        );
        return true;
      }
      case "CronJob": {
        const { batch } = this.requireClients();
        await this.invoke(() =>
          batch.patchNamespacedCronJob(
            {
              name: ref.name,
              namespace: ref.namespace,
              body: {
                spec: {
                  jobTemplate: {
                    spec: {
                      template: {
                        spec: {
                          containers: [
                            { name: containerName, resources: resourcesPatch },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
            STRATEGIC_MERGE_PATCH_OPTIONS,
          ),
        );
        return true;
      }
      case "ScaledJob": {
        const { custom } = this.requireClients();
        await this.invoke(() =>
          custom.patchNamespacedCustomObject(
            {
              group: KEDA_SCALEDJOB_GROUP,
              version: KEDA_SCALEDJOB_VERSION,
              namespace: ref.namespace,
              plural: KEDA_SCALEDJOB_PLURAL,
              name: ref.name,
              body: {
                spec: {
                  jobTargetRef: {
                    template: {
                      spec: {
                        containers: [
                          { name: containerName, resources: resourcesPatch },
                        ],
                      },
                    },
                  },
                },
              },
            },
            STRATEGIC_MERGE_PATCH_OPTIONS,
          ),
        );
        return true;
      }
      case "Job":
        return false;
      default:
        return false;
    }
  }

  async readScaledJob(
    name: string,
    namespace: string,
  ): Promise<Record<string, unknown> | null> {
    const { custom } = this.requireClients();
    return this.invoke(() =>
      custom.getNamespacedCustomObject({
        group: KEDA_SCALEDJOB_GROUP,
        version: KEDA_SCALEDJOB_VERSION,
        namespace,
        plural: KEDA_SCALEDJOB_PLURAL,
        name,
      }),
    ) as Promise<Record<string, unknown> | null>;
  }

  async bumpWorkloadMemory(
    ref: WorkloadRef,
    maxLimit: string,
  ): Promise<WorkloadMemoryPatchResult | null> {
    const mem = await this.readWorkloadMemory(ref);
    if (!mem) return null;

    const newLimit = bumpMemoryLimit(mem.currentLimit, maxLimit);
    if (newLimit === mem.currentLimit) {
      return {
        workload: ref,
        containerName: mem.containerName,
        currentLimit: mem.currentLimit,
        newLimit,
      };
    }

    const patched = await this.patchWorkloadMemory(
      ref,
      mem.containerName,
      newLimit,
      mem.requestMemory ?? mem.currentLimit,
    );
    if (!patched) return null;

    return {
      workload: ref,
      containerName: mem.containerName,
      currentLimit: mem.currentLimit,
      newLimit,
    };
  }

  async waitForStatefulSetRollout(
    name: string,
    namespace: string,
    timeoutMs = 120_000,
    pollIntervalMs = 3_000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const { apps } = this.requireClients();

    while (Date.now() < deadline) {
      const sts = await this.invoke(() =>
        apps.readNamespacedStatefulSet({ name, namespace }),
      );
      if (sts && isStatefulSetReady(sts)) return true;
      await sleep(pollIntervalMs);
    }
    return false;
  }

  async waitForWorkloadRollout(
    ref: WorkloadRef,
    timeoutMs = 120_000,
  ): Promise<boolean> {
    switch (ref.kind) {
      case "Deployment":
        return this.waitForRollout(ref.name, ref.namespace, timeoutMs);
      case "StatefulSet":
        return this.waitForStatefulSetRollout(ref.name, ref.namespace, timeoutMs);
      default:
        return true;
    }
  }

  workloadDisplayName(ref: WorkloadRef): string {
    return `${ref.kind}/${ref.name}`;
  }

  async waitForPodReady(
    name: string,
    namespace: string,
    timeoutMs = 60_000,
    pollIntervalMs = 3_000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const pod = await this.readPod(name, namespace);
      if (pod && isPodReady(pod)) return true;
      await sleep(pollIntervalMs);
    }

    return false;
  }

  async waitForRollout(
    deploymentName: string,
    namespace: string,
    timeoutMs = 60_000,
    pollIntervalMs = 3_000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const deploy = await this.readDeployment(deploymentName, namespace);
      if (deploy && isRolloutComplete(deploy)) return true;
      await sleep(pollIntervalMs);
    }

    return false;
  }

  async rollbackDeployment(name: string, namespace: string): Promise<void | null> {
    const { apps } = this.requireClients();
    const deploy = await this.readDeployment(name, namespace);
    if (!deploy?.spec?.selector?.matchLabels) return null;

    const labelSelector = Object.entries(deploy.spec.selector.matchLabels)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");

    const rsList = await this.invoke(() =>
      apps.listNamespacedReplicaSet({ namespace, labelSelector }),
    );
    if (!rsList?.items?.length) return null;

    const sorted = [...rsList.items].sort(
      (a, b) => revisionNumber(b) - revisionNumber(a),
    );
    const previous = sorted[1];
    if (!previous?.spec?.template) return null;

    return this.patchDeployment(name, namespace, {
      spec: { template: previous.spec.template },
      metadata: {
        annotations: {
          "kubectl.kubernetes.io/rolledback": new Date().toISOString(),
        },
      },
    });
  }

  async healthCheck(): Promise<{ ok: boolean; version: string }> {
    const { version } = this.requireClients();
    const info = await this.invoke(() => version.getCode({}));
    if (!info) {
      return { ok: false, version: "unknown" };
    }
    return {
      ok: true,
      version: info.gitVersion ?? info.major + "." + info.minor,
    };
  }

  async listNodeCount(): Promise<number | null> {
    const { core } = this.requireClients();
    const list = await this.invoke(() => core.listNode());
    return list?.items?.length ?? null;
  }

  async listNodes(): Promise<V1Node[] | null> {
    const { core } = this.requireClients();
    const list = await this.invoke(() => core.listNode());
    return list?.items ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPodReady(pod: V1Pod): boolean {
  if (pod.status?.phase !== "Running") return false;
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.length > 0 && statuses.every((s) => s.ready);
}

/** e.g. user-badge-batch-processor-scaledjob-qfzcx → user-badge-batch-processor-scaledjob */
function inferScaledJobNameFromJob(jobName: string): string | null {
  const marker = "-scaledjob";
  const idx = jobName.indexOf(marker);
  if (idx === -1) return null;
  const base = jobName.slice(0, idx + marker.length);
  return base.length > marker.length ? base : null;
}

function isStatefulSetReady(sts: V1StatefulSet): boolean {
  const desired = sts.spec?.replicas ?? sts.status?.replicas ?? 0;
  const ready = sts.status?.readyReplicas ?? 0;
  const updated = sts.status?.updatedReplicas ?? 0;
  return ready >= desired && updated >= desired;
}

function isRolloutComplete(deploy: V1Deployment): boolean {
  const desired = deploy.spec?.replicas ?? 0;
  const updated = deploy.status?.updatedReplicas ?? 0;
  const available = deploy.status?.availableReplicas ?? 0;
  const unavailable = deploy.status?.unavailableReplicas ?? 0;
  return updated >= desired && available >= desired && unavailable === 0;
}

function revisionNumber(rs: V1ReplicaSet): number {
  const rev = rs.metadata?.annotations?.["deployment.kubernetes.io/revision"];
  return rev ? Number.parseInt(rev, 10) : 0;
}
