import { KubeConfig } from "@kubernetes/client-node";

export interface ParsedKubeconfig {
  serverUrl: string;
  contextName: string;
}

export function parseKubeconfig(
  kubeconfigYaml: string,
  contextName?: string,
): ParsedKubeconfig {
  const kc = new KubeConfig();
  kc.loadFromString(kubeconfigYaml);

  const resolvedContext =
    contextName ?? kc.getCurrentContext() ?? kc.contexts[0]?.name;

  if (!resolvedContext) {
    throw new Error("Kubeconfig has no contexts");
  }

  kc.setCurrentContext(resolvedContext);
  const cluster = kc.getCurrentCluster();

  if (!cluster?.server) {
    throw new Error("Kubeconfig context has no cluster server URL");
  }

  return {
    serverUrl: cluster.server,
    contextName: resolvedContext,
  };
}

export function kubeconfigToBase64(kubeconfigYaml: string): string {
  return Buffer.from(kubeconfigYaml, "utf-8").toString("base64");
}
