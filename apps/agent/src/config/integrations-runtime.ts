export interface IntegrationsRuntimeOverrides {
  teamsWebhookUrl?: string;
}

let overrides: IntegrationsRuntimeOverrides = {};

export function setIntegrationsRuntime(
  patch: IntegrationsRuntimeOverrides,
): void {
  overrides = { ...overrides, ...patch };
}

export function clearIntegrationsRuntime(): void {
  overrides = {};
}

export function getIntegrationsRuntime(): Readonly<IntegrationsRuntimeOverrides> {
  return overrides;
}

export function maskWebhookUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.length <= 24) return "••••••••";
  return `${u.slice(0, 28)}••••${u.slice(-8)}`;
}
