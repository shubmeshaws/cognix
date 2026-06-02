const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.kubehealer.io";
}

export function getInstallManifestUrl(): string {
  return `${getAppOrigin()}/install/agent.yaml`;
}

export function getKubectlApplyCommand(): string {
  return `kubectl apply -f ${getInstallManifestUrl()}`;
}

export async function buildCustomInstallManifest(
  clusterToken: string,
): Promise<string> {
  const res = await fetch("/install/agent.yaml");
  const template = await res.text();
  return template
    .replaceAll("REPLACE_API_URL", API_BASE)
    .replaceAll("REPLACE_CLUSTER_TOKEN", clusterToken);
}

export function parseNamespaceFilter(input: string): string[] | undefined {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}
