import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  getSsoRuntime,
  setSsoRuntime,
  type SsoProviderId,
  type SsoProviderSettings,
  type SsoRuntimeState,
} from "./sso-runtime.js";

export interface SsoConfigFile {
  google?: SsoProviderSettings;
  github?: SsoProviderSettings;
  linkedin?: SsoProviderSettings;
}

const PROVIDERS: SsoProviderId[] = ["google", "github", "linkedin"];

const DEFAULT_PATH = join(process.cwd(), ".kubehealer", "sso.json");

function configPath(): string {
  return process.env.SSO_CONFIG_PATH?.trim() || DEFAULT_PATH;
}

function normalizeProvider(
  value: SsoProviderSettings | undefined,
): SsoProviderSettings | undefined {
  if (!value) return undefined;
  const clientId = value.clientId?.trim() ?? "";
  const clientSecret = value.clientSecret?.trim() ?? "";
  if (!clientId && !clientSecret && !value.enabled) {
    return undefined;
  }
  return {
    enabled: Boolean(value.enabled),
    clientId,
    clientSecret,
    ...(value.allowedDomains?.length
      ? {
          allowedDomains: value.allowedDomains
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
        }
      : {}),
  };
}

function normalizeFile(data: SsoConfigFile): SsoRuntimeState {
  const out: SsoRuntimeState = {};
  for (const id of PROVIDERS) {
    const normalized = normalizeProvider(data[id]);
    if (normalized) {
      out[id] = normalized;
    }
  }
  return out;
}

export async function loadSsoFromDisk(): Promise<void> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const data = JSON.parse(raw) as SsoConfigFile;
    setSsoRuntime(normalizeFile(data));
  } catch {
    setSsoRuntime({});
  }
}

export async function saveSsoToDisk(): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  const runtime = getSsoRuntime();
  const payload: SsoConfigFile = {};
  for (const id of PROVIDERS) {
    const settings = runtime[id];
    if (settings) {
      payload[id] = settings;
    }
  }
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
