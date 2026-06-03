export type SsoProviderId = "google" | "github" | "linkedin";

export interface SsoProviderSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  allowedDomains?: string[];
}

export type SsoRuntimeState = Partial<
  Record<SsoProviderId, SsoProviderSettings>
>;

let runtime: SsoRuntimeState = {};

export function getSsoRuntime(): SsoRuntimeState {
  return runtime;
}

export function setSsoRuntime(next: SsoRuntimeState): void {
  runtime = next;
}

export function maskClientSecret(secret: string | undefined): string | null {
  const value = secret?.trim();
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}
