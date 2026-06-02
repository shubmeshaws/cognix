import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  getIntegrationsRuntime,
  setIntegrationsRuntime,
} from "./integrations-runtime.js";

export interface IntegrationsFile {
  teamsWebhookUrl?: string;
}

const DEFAULT_PATH = join(process.cwd(), ".kubehealer", "integrations.json");

function configPath(): string {
  return process.env.INTEGRATIONS_CONFIG_PATH?.trim() || DEFAULT_PATH;
}

export async function loadIntegrationsFromDisk(): Promise<void> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const data = JSON.parse(raw) as IntegrationsFile;
    const url = data.teamsWebhookUrl?.trim();
    if (url) {
      setIntegrationsRuntime({ teamsWebhookUrl: url });
    }
  } catch {
    // No integrations file yet — configure webhook in Settings
  }
}

export async function saveIntegrationsToDisk(): Promise<void> {
  const url = getIntegrationsRuntime().teamsWebhookUrl?.trim() ?? "";
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  const payload: IntegrationsFile = url ? { teamsWebhookUrl: url } : {};
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
