"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Globe, KeyRound, Linkedin, ShieldCheck } from "lucide-react";

import { useAgentToken } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { fetchSsoConfig, parseApiErrorMessage, resetSsoConfig, updateSsoConfig } from "@/lib/api";
import type { SsoProviderId } from "@/types/api";
import { cn } from "@/lib/utils";

const PROVIDERS: Array<{
  id: SsoProviderId;
  label: string;
  description: string;
  icon: typeof Globe;
  clientIdPlaceholder: string;
}> = [
  {
    id: "google",
    label: "Google",
    description: "Sign in with Google OAuth 2.0",
    icon: Globe,
    clientIdPlaceholder: "123456789.apps.googleusercontent.com",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Sign in with GitHub OAuth app",
    icon: Github,
    clientIdPlaceholder: "Ov23li…",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    description: "Sign in with LinkedIn OpenID Connect",
    icon: Linkedin,
    clientIdPlaceholder: "86abc123def456",
  },
];

type ProviderDraft = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  clientSecretSet: boolean;
  clientSecretPreview: string | null;
  allowedDomains: string;
};

function emptyDraft(): ProviderDraft {
  return {
    enabled: false,
    clientId: "",
    clientSecret: "",
    clientSecretSet: false,
    clientSecretPreview: null,
    allowedDomains: "",
  };
}

function EnableToggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label} SSO`}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        enabled
          ? "border-primary bg-primary"
          : "border-input bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          enabled ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function AdminSsoPanel() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<SsoProviderId, ProviderDraft>>({
    google: emptyDraft(),
    github: emptyDraft(),
    linkedin: emptyDraft(),
  });
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<{
    id: SsoProviderId;
    label: string;
  } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["admin-sso-config", token],
    queryFn: () => fetchSsoConfig(token!),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setDrafts({
      google: {
        enabled: configQuery.data.providers.google.enabled,
        clientId: configQuery.data.providers.google.clientId,
        clientSecret: "",
        clientSecretSet: configQuery.data.providers.google.clientSecretSet,
        clientSecretPreview: configQuery.data.providers.google.clientSecretPreview,
        allowedDomains: configQuery.data.providers.google.allowedDomains ?? "",
      },
      github: {
        enabled: configQuery.data.providers.github.enabled,
        clientId: configQuery.data.providers.github.clientId,
        clientSecret: "",
        clientSecretSet: configQuery.data.providers.github.clientSecretSet,
        clientSecretPreview: configQuery.data.providers.github.clientSecretPreview,
        allowedDomains: "",
      },
      linkedin: {
        enabled: configQuery.data.providers.linkedin.enabled,
        clientId: configQuery.data.providers.linkedin.clientId,
        clientSecret: "",
        clientSecretSet: configQuery.data.providers.linkedin.clientSecretSet,
        clientSecretPreview: configQuery.data.providers.linkedin.clientSecretPreview,
        allowedDomains: "",
      },
    });
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (providerId: SsoProviderId) => {
      if (!token) throw new Error("Not authenticated");
      const draft = drafts[providerId];
      return updateSsoConfig(token, {
        [providerId]: {
          enabled: draft.enabled,
          clientId: draft.clientId.trim(),
          ...(draft.clientSecret.trim()
            ? { clientSecret: draft.clientSecret.trim() }
            : {}),
          ...(providerId === "google"
            ? { allowedDomains: draft.allowedDomains.trim() }
            : {}),
        },
      });
    },
    onSuccess: (data, providerId) => {
      setSaveMsg({
        ok: true,
        text: `${PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId} SSO saved.`,
      });
      setDrafts((prev) => ({
        ...prev,
        [providerId]: {
          enabled: data.providers[providerId].enabled,
          clientId: data.providers[providerId].clientId,
          clientSecret: "",
          clientSecretSet: data.providers[providerId].clientSecretSet,
          clientSecretPreview: data.providers[providerId].clientSecretPreview,
          allowedDomains:
            providerId === "google"
              ? (data.providers.google.allowedDomains ?? "")
              : "",
        },
      }));
      void queryClient.invalidateQueries({ queryKey: ["admin-sso-config"] });
    },
    onError: (err) =>
      setSaveMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  function updateDraft(
    providerId: SsoProviderId,
    patch: Partial<ProviderDraft>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], ...patch },
    }));
    setSaveMsg(null);
  }

  function canSave(providerId: SsoProviderId): boolean {
    const draft = drafts[providerId];
    if (!draft.enabled) return true;
    const hasClientId = draft.clientId.trim().length > 0;
    const hasSecret =
      draft.clientSecret.trim().length > 0 || draft.clientSecretSet;
    return hasClientId && hasSecret;
  }

  function hasStoredConfig(providerId: SsoProviderId): boolean {
    const draft = drafts[providerId];
    return (
      draft.enabled ||
      draft.clientId.trim().length > 0 ||
      draft.clientSecretSet ||
      draft.clientSecret.trim().length > 0 ||
      (providerId === "google" && draft.allowedDomains.trim().length > 0)
    );
  }

  const resetMutation = useMutation({
    mutationFn: async (providerId: SsoProviderId) => {
      if (!token) throw new Error("Not authenticated");
      return resetSsoConfig(token, providerId);
    },
    onSuccess: (_data, providerId) => {
      setResetTarget(null);
      setResetError(null);
      setSaveMsg({
        ok: true,
        text: `${PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId} SSO credentials reset.`,
      });
      setDrafts((prev) => ({
        ...prev,
        [providerId]: emptyDraft(),
      }));
      void queryClient.invalidateQueries({ queryKey: ["admin-sso-config"] });
    },
    onError: (err) => {
      setResetError(parseApiErrorMessage(err));
    },
  });

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Single sign-on</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable Google, GitHub, or LinkedIn on the login page. Credentials are
            stored on the agent and persist across restarts.
          </p>
        </div>
      </div>

      {saveMsg ? (
        <p
          className={cn(
            "mt-4 rounded-md border px-3 py-2 text-sm",
            saveMsg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {saveMsg.text}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {PROVIDERS.map(({ id, label, description, icon: Icon, clientIdPlaceholder }) => {
          const draft = drafts[id];
          const saving = saveMutation.isPending && saveMutation.variables === id;
          const resetting = resetMutation.isPending && resetMutation.variables === id;
          const isActive = draft.enabled && (draft.clientSecretSet || draft.clientSecret.trim());

          return (
            <article
              key={id}
              className={cn(
                "rounded-xl border bg-background p-5 shadow-sm",
                draft.enabled
                  ? "border-primary/40 ring-1 ring-primary/10"
                  : "border-border",
              )}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-lg border border-border bg-card p-2.5">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{label}</h3>
                      {isActive ? (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Visible on login
                        </span>
                      ) : draft.enabled ? (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Needs credentials
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 self-start sm:self-center">
                  <span className="text-sm font-medium text-foreground">
                    {draft.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <EnableToggle
                    enabled={draft.enabled}
                    label={label}
                    onChange={(enabled) => updateDraft(id, { enabled })}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
                <label className="block space-y-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    Client ID
                  </span>
                  <Input
                    value={draft.clientId}
                    onChange={(e) => updateDraft(id, { clientId: e.target.value })}
                    placeholder={clientIdPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!draft.enabled}
                    className="h-10 bg-card"
                  />
                </label>

                <label className="block space-y-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    Client secret
                  </span>
                  <Input
                    type="password"
                    value={draft.clientSecret}
                    onChange={(e) =>
                      updateDraft(id, { clientSecret: e.target.value })
                    }
                    placeholder={
                      draft.clientSecretSet && draft.clientSecretPreview
                        ? `Saved: ${draft.clientSecretPreview} — paste to replace`
                        : "Paste client secret"
                    }
                    autoComplete="new-password"
                    spellCheck={false}
                    disabled={!draft.enabled}
                    className="h-10 bg-card"
                  />
                </label>

                {id === "google" ? (
                  <label className="block space-y-2 text-sm md:col-span-2">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      Allowed email domains
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </span>
                    <Input
                      value={draft.allowedDomains}
                      onChange={(e) =>
                        updateDraft(id, { allowedDomains: e.target.value })
                      }
                      placeholder="cognix.com, example.com"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={!draft.enabled}
                      className="h-10 bg-card"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list. When set, only Google accounts with
                      these email domains can sign in. Leave empty to allow any
                      Google account.
                    </p>
                  </label>
                ) : null}
              </div>

              {draft.enabled ? (
                <div className="mt-3 space-y-3">
                  {draft.clientSecretSet ? (
                    <p className="text-xs text-muted-foreground">
                      Secret is saved on the agent. Leave blank to keep the current
                      secret when saving other changes.
                    </p>
                  ) : null}
                  {!draft.clientId.trim() ||
                  (!draft.clientSecret.trim() && !draft.clientSecretSet) ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      Client ID and secret are required before this provider appears
                      on the login page.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Turn on the switch above to configure OAuth credentials for {label}.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    resetting ||
                    saving ||
                    !hasStoredConfig(id)
                  }
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setResetError(null);
                    setResetTarget({ id, label });
                  }}
                >
                  {resetting ? "Resetting…" : "Reset credentials"}
                </Button>
                <Button
                  type="button"
                  disabled={saving || resetting || !canSave(id)}
                  onClick={() => {
                    setSaveMsg(null);
                    saveMutation.mutate(id);
                  }}
                >
                  {saving ? "Saving…" : `Save ${label}`}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        open={resetTarget !== null}
        title={
          resetTarget ? `Reset ${resetTarget.label} credentials?` : "Reset credentials?"
        }
        description={
          resetTarget
            ? `This removes the saved client ID, secret, and settings for ${resetTarget.label} from the agent. The provider will no longer appear on the login page until reconfigured.`
            : ""
        }
        error={resetError}
        confirmLabel="Reset credentials"
        variant="destructive"
        loading={resetMutation.isPending}
        onCancel={() => {
          if (!resetMutation.isPending) {
            setResetTarget(null);
            setResetError(null);
          }
        }}
        onConfirm={() => {
          if (!resetTarget) return;
          setSaveMsg(null);
          setResetError(null);
          resetMutation.mutate(resetTarget.id);
        }}
      />
    </section>
  );
}
