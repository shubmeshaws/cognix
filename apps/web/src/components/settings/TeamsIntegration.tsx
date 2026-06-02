"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";

import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import {
  fetchTeamsConfig,
  parseApiErrorMessage,
  testTeamsConnection,
  updateTeamsConfig,
} from "@/lib/api";
import { useAgentToken } from "@/hooks/useAgentToken";
import { cn } from "@/lib/utils";

export function TeamsIntegration() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [configuredOnAgent, setConfiguredOnAgent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const configQuery = useQuery({
    queryKey: ["teams-config"],
    queryFn: () => fetchTeamsConfig(token!),
    enabled: Boolean(token),
    retry: 1,
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setConfiguredOnAgent(configQuery.data.teamsWebhookUrlSet);
    setPreview(configQuery.data.teamsWebhookUrlPreview);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not authenticated");
      const url = webhookUrl.trim();
      return updateTeamsConfig(token, { teamsWebhookUrl: url });
    },
    onSuccess: (data) => {
      setSaveMsg({
        ok: true,
        text: "Teams webhook saved on agent (persists across restarts).",
      });
      setConfiguredOnAgent(data.teamsWebhookUrlSet);
      setPreview(data.teamsWebhookUrlPreview);
      setWebhookUrl("");
      void queryClient.invalidateQueries({ queryKey: ["teams-config"] });
    },
    onError: (err) =>
      setSaveMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return updateTeamsConfig(token, { teamsWebhookUrl: "" });
    },
    onSuccess: () => {
      setSaveMsg({ ok: true, text: "Teams webhook cleared on agent." });
      setConfiguredOnAgent(false);
      setPreview(null);
      setWebhookUrl("");
      void queryClient.invalidateQueries({ queryKey: ["teams-config"] });
    },
    onError: (err) =>
      setSaveMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not authenticated");
      const url = webhookUrl.trim();
      return testTeamsConnection(
        token,
        url ? { teamsWebhookUrl: url } : {},
      );
    },
    onSuccess: (data) => setTestMsg({ ok: data.ok, text: data.message }),
    onError: (err) =>
      setTestMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  const fieldClass =
    "w-full rounded-md border bg-background px-3 py-2 font-mono text-xs";

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Microsoft Teams</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        When a pod is successfully healed, KubeHealer posts an adaptive card to
        your Teams channel with cluster, pod, issue, fix details, and who
        triggered the heal. The URL is stored on the agent (not in .env). Use
        Send test notification first — heal alerts only fire when status is
        healed (not escalated or failed).
      </p>

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium" htmlFor="teams-webhook-url">
              Incoming webhook URL
            </label>
            <InfoTooltip content="Create an Incoming Webhook in your Teams channel (Workflows or Connectors). Paste the full POST URL here." />
          </div>
          <input
            id="teams-webhook-url"
            type="url"
            className={fieldClass}
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={
              configuredOnAgent && preview
                ? `Saved: ${preview} — paste a new URL to replace`
                : "https://…webhook.office.com/…"
            }
            autoComplete="off"
            spellCheck={false}
          />
          {configuredOnAgent && (
            <p className="text-xs text-muted-foreground">
              Webhook is configured on the agent
              {preview ? ` (${preview})` : ""}. Leave blank and save to clear
              only when replacing with a new URL, or paste a new URL to update.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={saveMutation.isPending || !webhookUrl.trim()}
            onClick={() => {
              setSaveMsg(null);
              saveMutation.mutate();
            }}
          >
            Save to agent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={testMutation.isPending}
            onClick={() => {
              setTestMsg(null);
              testMutation.mutate();
            }}
          >
            Send test notification
          </Button>
          {configuredOnAgent && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={clearMutation.isPending}
              onClick={() => {
                setSaveMsg(null);
                clearMutation.mutate();
              }}
            >
              Clear webhook
            </Button>
          )}
        </div>

        {saveMsg && (
          <p
            className={cn(
              "text-sm",
              saveMsg.ok ? "text-emerald-600" : "text-destructive",
            )}
          >
            {saveMsg.text}
          </p>
        )}
        {testMsg && (
          <p
            className={cn(
              "text-sm",
              testMsg.ok ? "text-emerald-600" : "text-destructive",
            )}
          >
            {testMsg.text}
          </p>
        )}
      </div>
    </section>
  );
}
