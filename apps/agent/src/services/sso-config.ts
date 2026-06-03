import type { Env } from "../config/env.js";
import {
  formatAllowedDomains,
  isEmailDomainAllowed,
  parseAllowedDomains,
} from "../lib/email-domain.js";
import {
  getSsoRuntime,
  maskClientSecret,
  setSsoRuntime,
  type SsoProviderId,
  type SsoProviderSettings,
} from "../config/sso-runtime.js";
import { saveSsoToDisk } from "../config/sso-store.js";

const PROVIDERS: SsoProviderId[] = ["google", "github", "linkedin"];

export interface SsoProviderAdminView {
  enabled: boolean;
  clientId: string;
  clientSecretSet: boolean;
  clientSecretPreview: string | null;
  configured: boolean;
  allowedDomains?: string;
}

export interface SsoConfigAdminResponse {
  providers: Record<SsoProviderId, SsoProviderAdminView>;
}

export interface SsoPublicResponse {
  providers: SsoProviderId[];
}

export interface SsoInternalResponse {
  providers: Partial<Record<SsoProviderId, SsoProviderSettings>>;
}

function envFallback(
  env: Env,
  id: SsoProviderId,
): SsoProviderSettings | undefined {
  if (id === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) return undefined;
    const allowedDomains = parseAllowedDomains(
      process.env.GOOGLE_ALLOWED_DOMAINS ?? process.env.ALLOWED_DOMAINS,
    );
    return {
      enabled: true,
      clientId,
      clientSecret,
      ...(allowedDomains.length ? { allowedDomains } : {}),
    };
  }
  if (id === "github") {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) return undefined;
    return { enabled: true, clientId, clientSecret };
  }
  if (id === "linkedin") {
    const clientId = process.env.LINKEDIN_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) return undefined;
    return { enabled: true, clientId, clientSecret };
  }
  return undefined;
}

function getStoredProvider(
  env: Env,
  id: SsoProviderId,
): SsoProviderSettings | undefined {
  const stored = getSsoRuntime()[id];
  if (stored?.clientId && stored.clientSecret) {
    return stored;
  }
  return envFallback(env, id);
}

function isProviderActive(settings: SsoProviderSettings | undefined): boolean {
  return Boolean(
    settings?.enabled && settings.clientId && settings.clientSecret,
  );
}

function adminViewForProvider(
  env: Env,
  id: SsoProviderId,
): SsoProviderAdminView {
  void env;
  const stored = getSsoRuntime()[id];
  const allowedDomainsSource = stored?.allowedDomains;

  return {
    enabled: Boolean(stored?.enabled),
    clientId: stored?.clientId ?? "",
    clientSecretSet: Boolean(stored?.clientSecret),
    clientSecretPreview: maskClientSecret(stored?.clientSecret),
    configured: isProviderActive(stored),
    ...(id === "google"
      ? { allowedDomains: formatAllowedDomains(allowedDomainsSource) }
      : {}),
  };
}

export function getGoogleAllowedDomains(env: Env): string[] {
  const stored = getSsoRuntime().google;
  if (stored?.allowedDomains?.length) {
    return stored.allowedDomains;
  }
  const fallback = envFallback(env, "google");
  return fallback?.allowedDomains ?? [];
}

export function assertGoogleEmailAllowed(
  env: Env,
  email: string,
): void {
  const allowed = getGoogleAllowedDomains(env);
  if (!isEmailDomainAllowed(email, allowed)) {
    const hint =
      allowed.length === 1
        ? `@${allowed[0]}`
        : allowed.map((domain) => `@${domain}`).join(", ");
    throw new Error(`Google sign-in is restricted to ${hint} email addresses`);
  }
}

export function getSsoConfigAdminResponse(env: Env): SsoConfigAdminResponse {
  const providers = {} as Record<SsoProviderId, SsoProviderAdminView>;

  for (const id of PROVIDERS) {
    providers[id] = adminViewForProvider(env, id);
  }

  return { providers };
}

export function getSsoPublicResponse(env: Env): SsoPublicResponse {
  const providers: SsoProviderId[] = [];
  for (const id of PROVIDERS) {
    const stored = getSsoRuntime()[id];
    const effective = getStoredProvider(env, id);
    const enabled = stored?.enabled ?? effective?.enabled ?? false;
    const settings = stored?.clientId && stored.clientSecret ? stored : effective;
    if (enabled && isProviderActive(settings)) {
      providers.push(id);
    }
  }
  return { providers };
}

export function getSsoInternalResponse(env: Env): SsoInternalResponse {
  const providers: Partial<Record<SsoProviderId, SsoProviderSettings>> = {};
  for (const id of PROVIDERS) {
    const stored = getSsoRuntime()[id];
    const enabled = stored?.enabled ?? envFallback(env, id)?.enabled ?? false;
    const settings = stored?.clientId && stored.clientSecret
      ? stored
      : envFallback(env, id);
    if (enabled && isProviderActive(settings)) {
      providers[id] = settings!;
    }
  }
  return { providers };
}

export async function applySsoConfigPatch(
  env: Env,
  patch: Partial<
    Record<
      SsoProviderId,
      {
        enabled?: boolean;
        clientId?: string;
        clientSecret?: string;
        allowedDomains?: string;
      }
    >
  >,
): Promise<SsoConfigAdminResponse> {
  const next = { ...getSsoRuntime() };

  for (const id of PROVIDERS) {
    const update = patch[id];
    if (!update) continue;

    const current = next[id] ?? {
      enabled: false,
      clientId: "",
      clientSecret: "",
      ...(id === "google" ? { allowedDomains: [] as string[] } : {}),
    };

    const clientId =
      update.clientId !== undefined ? update.clientId.trim() : current.clientId;
    const clientSecret =
      update.clientSecret !== undefined && update.clientSecret.trim() !== ""
        ? update.clientSecret.trim()
        : current.clientSecret;

    const nextSettings: SsoProviderSettings = {
      enabled: update.enabled ?? current.enabled,
      clientId,
      clientSecret,
    };

    if (id === "google") {
      if (update.allowedDomains !== undefined) {
        nextSettings.allowedDomains = parseAllowedDomains(update.allowedDomains);
      } else if (current.allowedDomains?.length) {
        nextSettings.allowedDomains = current.allowedDomains;
      }
    }

    next[id] = nextSettings;

    if (!next[id]!.clientId && !next[id]!.clientSecret && !next[id]!.enabled) {
      delete next[id];
      continue;
    }

    if (next[id]!.enabled && (!next[id]!.clientId || !next[id]!.clientSecret)) {
      throw new Error(
        `${id.charAt(0).toUpperCase()}${id.slice(1)} SSO requires client ID and client secret when enabled`,
      );
    }
  }

  setSsoRuntime(next);
  await saveSsoToDisk();
  return getSsoConfigAdminResponse(env);
}

export async function resetSsoProviderConfig(
  env: Env,
  providerId: SsoProviderId,
): Promise<SsoConfigAdminResponse> {
  const next = { ...getSsoRuntime() };
  delete next[providerId];
  setSsoRuntime(next);
  await saveSsoToDisk();
  return getSsoConfigAdminResponse(env);
}
