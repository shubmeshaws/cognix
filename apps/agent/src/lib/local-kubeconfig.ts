import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { KubeConfig } from "@kubernetes/client-node";

export interface LocalKubeconfigPayload {
  path: string;
  kubeconfig: string;
  currentContext: string | null;
  contexts: string[];
}

export function resolveKubeconfigPath(): string {
  const fromEnv = process.env.KUBECONFIG?.trim();
  if (fromEnv) {
    const first = fromEnv.split(path.delimiter).find((p) => p.trim());
    if (first) return path.resolve(first);
  }
  return path.join(os.homedir(), ".kube", "config");
}

export function readLocalKubeconfig(): LocalKubeconfigPayload {
  const configPath = resolveKubeconfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Kubeconfig not found at ${configPath}. Set KUBECONFIG or place config at ~/.kube/config`,
    );
  }

  const kubeconfig = fs.readFileSync(configPath, "utf-8");
  const kc = new KubeConfig();
  kc.loadFromString(kubeconfig);

  const contexts = kc.contexts
    .map((c) => c.name)
    .filter((name): name is string => Boolean(name));

  const currentContext = kc.getCurrentContext() ?? contexts[0] ?? null;

  return {
    path: configPath,
    kubeconfig,
    currentContext,
    contexts,
  };
}
