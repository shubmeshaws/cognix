import { createServer } from "node:http";

import { ClusterConnection } from "../k8s/connection.js";

const API_URL = process.env.KUBEHEALER_API_URL?.replace(/\/$/, "");
const CLUSTER_TOKEN = process.env.KUBEHEALER_CLUSTER_TOKEN;

const HEALTH_PORT = Number(process.env.PORT ?? 8080);

async function probeCluster(): Promise<{
  version: string;
  nodeCount: number | null;
  namespaces: string[];
}> {
  const conn = new ClusterConnection({
    id: "in-cluster-probe",
    name: "in-cluster",
    inCluster: true,
  });
  conn.connect();

  const health = await conn.healthCheck();
  const nodeCount = await conn.listNodeCount();
  const namespaces = (await conn.listNamespaces()) ?? [];

  return {
    version: health.version,
    nodeCount,
    namespaces,
  };
}

async function registerWithSaaS(meta: {
  version: string;
  nodeCount: number | null;
  namespaces: string[];
}): Promise<void> {
  if (!API_URL || !CLUSTER_TOKEN) {
    throw new Error(
      "KUBEHEALER_API_URL and KUBEHEALER_CLUSTER_TOKEN must be set (kubehealer-config secret)",
    );
  }

  const res = await fetch(`${API_URL}/api/clusters/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inCluster: true,
      token: CLUSTER_TOKEN,
      version: meta.version,
      nodeCount: meta.nodeCount,
      namespaces: meta.namespaces,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Connect failed (${res.status}): ${body}`);
  }

  const result = (await res.json()) as { clusterId: string };
  console.info(`KubeHealer cluster registered: ${result.clusterId}`);
}

function startHealthServer(): void {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(HEALTH_PORT, "0.0.0.0", () => {
    console.info(`health server listening on :${HEALTH_PORT}`);
  });
}

async function main(): Promise<void> {
  startHealthServer();

  const meta = await probeCluster();
  await registerWithSaaS(meta);

  console.info("in-cluster agent ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
