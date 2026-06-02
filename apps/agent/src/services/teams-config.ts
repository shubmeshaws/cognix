import type { Env } from "../config/env.js";
import {
  getIntegrationsRuntime,
  maskWebhookUrl,
  setIntegrationsRuntime,
} from "../config/integrations-runtime.js";
import { saveIntegrationsToDisk } from "../config/integrations-store.js";
import { sendTeamsAdaptiveCard } from "../healer/teams-notify.js";

export interface TeamsConfigResponse {
  teamsWebhookUrlSet: boolean;
  teamsWebhookUrlPreview: string | null;
}

/** Teams webhook is configured only via Settings (persisted to integrations file). */
export function getEffectiveTeamsWebhookUrl(_env: Env): string | undefined {
  return getIntegrationsRuntime().teamsWebhookUrl?.trim() || undefined;
}

export function getTeamsConfigResponse(env: Env): TeamsConfigResponse {
  const url = getEffectiveTeamsWebhookUrl(env);
  return {
    teamsWebhookUrlSet: Boolean(url),
    teamsWebhookUrlPreview: maskWebhookUrl(url),
  };
}

export async function applyTeamsConfigPatch(
  env: Env,
  patch: { teamsWebhookUrl?: string },
): Promise<TeamsConfigResponse> {
  if (patch.teamsWebhookUrl !== undefined) {
    const trimmed = patch.teamsWebhookUrl.trim();
    setIntegrationsRuntime({
      teamsWebhookUrl: trimmed || undefined,
    });
    await saveIntegrationsToDisk();
  }
  return getTeamsConfigResponse(env);
}

export async function testTeamsConnection(
  env: Env,
  webhookUrl?: string,
): Promise<{ ok: boolean; message: string }> {
  const url = webhookUrl?.trim() || getEffectiveTeamsWebhookUrl(env);
  if (!url) {
    return {
      ok: false,
      message:
        "Not configured — paste your Microsoft Teams incoming webhook URL and save.",
    };
  }

  return sendTeamsAdaptiveCard(
    url,
    {
      summary: "KubeHealer test notification",
      title: "KubeHealer — test notification",
      subtitle:
        "If you see this card, Teams integration is configured correctly.",
      facts: [
        { title: "Status", value: "Test successful" },
        { title: "Source", value: "KubeHealer Settings" },
      ],
    },
    { timeoutMs: 15_000 },
  );
}
