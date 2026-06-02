import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  ApiException,
  KubeConfig,
  type CoreV1Event,
  type V1Pod,
} from "@kubernetes/client-node";
import type { ClusterConfig } from "@kubehealer/shared";

import { ClusterConnection, type K8sClients } from "./connection.js";
import { AuthError, ConnectionError } from "./errors.js";

const baseConfig: ClusterConfig = {
  id: "cluster-1",
  name: "test-cluster",
};

const mockPod: V1Pod = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: "nginx", namespace: "default" },
};

function createMockClients(overrides: Partial<K8sClients> = {}): K8sClients {
  const kubeConfig = {
    makeApiClient: mock.fn(),
    loadFromString: mock.fn(),
    loadFromCluster: mock.fn(),
    setCurrentContext: mock.fn(),
  } as unknown as K8sClients["kubeConfig"];

  const core = {
    listNamespacedPod: mock.fn(async () => ({ items: [mockPod] })),
    listPodForAllNamespaces: mock.fn(async () => ({ items: [mockPod] })),
    listNamespacedEvent: mock.fn(async () => ({ items: [] as CoreV1Event[] })),
    listEventForAllNamespaces: mock.fn(async () => ({ items: [] as CoreV1Event[] })),
    readNamespacedPodLog: mock.fn(async () => "log line\n"),
    deleteNamespacedPod: mock.fn(async () => mockPod),
  } as unknown as K8sClients["core"];

  const apps = {
    patchNamespacedDeployment: mock.fn(async () => ({})),
    replaceNamespacedDeploymentScale: mock.fn(async () => ({
      spec: { replicas: 2 },
    })),
    readNamespacedReplicaSet: mock.fn(async () => ({
      metadata: { ownerReferences: [{ kind: "Deployment", name: "api" }] },
    })),
  } as unknown as K8sClients["apps"];

  const batch = {
    readNamespacedJob: mock.fn(async () => ({
      metadata: { labels: { "scaledjob.keda.sh/name": "user-badge-batch-processor-scaledjob" } },
    })),
  } as unknown as K8sClients["batch"];

  const custom = {
    listNamespacedCustomObject: mock.fn(async () => ({ items: [] })),
  } as unknown as K8sClients["custom"];

  const version = {
    getCode: mock.fn(async () => ({
      gitVersion: "v1.29.0",
      major: "1",
      minor: "29",
    })),
  } as unknown as K8sClients["version"];

  return {
    kubeConfig,
    core,
    apps,
    batch,
    custom,
    version,
    ...overrides,
  };
}

describe("ClusterConnection.connect", () => {
  it("uses injected clients without loading kubeconfig", () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();
    assert.equal(conn["clients"], clients);
  });

  it("loads kubeconfig from base64 and applies context", () => {
    const loadFromString = mock.fn();
    const setCurrentContext = mock.fn();
    const makeApiClient = mock.fn(() => ({}));

    mock.method(KubeConfig.prototype, "loadFromString", loadFromString);
    mock.method(KubeConfig.prototype, "setCurrentContext", setCurrentContext);
    mock.method(KubeConfig.prototype, "makeApiClient", makeApiClient);

    const yaml = "apiVersion: v1\nkind: Config";
    const conn = new ClusterConnection({
      ...baseConfig,
      kubeconfigBase64: Buffer.from(yaml, "utf-8").toString("base64"),
      context: "my-context",
    });

    conn.connect();

    assert.equal(loadFromString.mock.calls.length, 1);
    assert.equal(setCurrentContext.mock.calls[0]?.arguments[0], "my-context");
    assert.equal(makeApiClient.mock.calls.length, 5);

    mock.restoreAll();
  });

  it("throws when no auth method is configured", () => {
    const conn = new ClusterConnection(baseConfig);
    assert.throws(() => conn.connect(), ConnectionError);
  });
});

describe("ClusterConnection API", () => {
  it("listPods returns items from the API", async () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const pods = await conn.listPods("default");
    assert.deepEqual(pods, [mockPod]);
  });

  it("listPods without filter uses listPodForAllNamespaces", async () => {
    const listAll = mock.fn(async () => ({ items: [mockPod] }));
    const listNs = mock.fn(async () => ({ items: [] as V1Pod[] }));
    const clients = createMockClients({
      core: {
        ...createMockClients().core,
        listPodForAllNamespaces: listAll,
        listNamespacedPod: listNs,
      } as K8sClients["core"],
    });
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const pods = await conn.listPods();
    assert.deepEqual(pods, [mockPod]);
    assert.equal(listAll.mock.calls.length, 1);
    assert.equal(listNs.mock.calls.length, 0);
  });

  it("getPodLogs returns log text", async () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const logs = await conn.getPodLogs("nginx", "default", true);
    assert.equal(logs, "log line\n");
  });

  it("returns null on 404", async () => {
    const clients = createMockClients({
      core: {
        ...createMockClients().core,
        readNamespacedPodLog: mock.fn(async () => {
          throw new ApiException(404, "not found", {}, {});
        }),
      } as K8sClients["core"],
    });
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const logs = await conn.getPodLogs("missing", "default");
    assert.equal(logs, null);
  });

  it("throws AuthError on 403", async () => {
    const clients = createMockClients({
      core: {
        ...createMockClients().core,
        listNamespacedPod: mock.fn(async () => {
          throw new ApiException(403, "forbidden", {}, {});
        }),
      } as K8sClients["core"],
    });
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    await assert.rejects(() => conn.listPods("default"), AuthError);
  });

  it("retries network errors then succeeds", async () => {
    let attempts = 0;
    const clients = createMockClients({
      core: {
        ...createMockClients().core,
        listNamespacedPod: mock.fn(async () => {
          attempts += 1;
          if (attempts < 2) {
            const err = new Error("connection reset");
            (err as NodeJS.ErrnoException).code = "ECONNRESET";
            throw err;
          }
          return { items: [mockPod] };
        }),
      } as K8sClients["core"],
    });
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const pods = await conn.listPods("default");
    assert.equal(attempts, 2);
    assert.deepEqual(pods, [mockPod]);
  });

  it("rolloutRestart patches deployment with restartedAt annotation", async () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    await conn.rolloutRestart("api", "default");

    const patchFn = clients.apps.patchNamespacedDeployment as ReturnType<typeof mock.fn>;
    assert.equal(patchFn.mock.calls.length, 1);
    const request = patchFn.mock.calls[0]?.arguments[0] as {
      name?: string;
      namespace?: string;
      body?: {
        spec?: {
          template?: { metadata?: { annotations?: Record<string, string> } };
        };
      };
    };
    const patchOpts = patchFn.mock.calls[0]?.arguments[1] as {
      middleware?: Array<{ pre?: unknown }>;
    };
    assert.equal(request.name, "api");
    assert.equal(request.namespace, "default");
    assert.ok(patchOpts?.middleware?.length);
    assert.equal(typeof patchOpts?.middleware?.[0]?.pre, "function");
    assert.ok(
      request.body?.spec?.template?.metadata?.annotations?.[
        "kubectl.kubernetes.io/restartedAt"
      ],
    );
  });

  it("scaleDeployment sets replica count", async () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    await conn.scaleDeployment("api", "default", 3);

    const scaleFn = clients.apps.replaceNamespacedDeploymentScale as ReturnType<
      typeof mock.fn
    >;
    assert.equal(scaleFn.mock.calls[0]?.arguments[0]?.body?.spec?.replicas, 3);
  });

  it("healthCheck returns cluster version", async () => {
    const clients = createMockClients();
    const conn = new ClusterConnection(baseConfig, { clients });
    conn.connect();

    const health = await conn.healthCheck();
    assert.equal(health.ok, true);
    assert.equal(health.version, "v1.29.0");
  });
});
