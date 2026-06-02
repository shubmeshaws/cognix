"use client";

import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { InfoTooltip } from "@/components/InfoTooltip";
import { buildAgentConfigRows } from "@/lib/agent-config-display";
import { useSettingsStore } from "@/stores/settings";
import type { AgentStatus } from "@/types/api";

export function AgentConfigRows({
  agent,
  pendingApprovals,
  wsConnected,
  showSettingsLink = false,
}: {
  agent: AgentStatus | undefined;
  pendingApprovals: number;
  wsConnected: boolean;
  showSettingsLink?: boolean;
}) {
  const settings = useSettingsStore(
    useShallow((s) => ({
      llmChain: s.llmChain,
      healingMode: s.healingMode,
      ollamaUrl: s.ollamaUrl,
      ollamaModel: s.ollamaModel,
      openaiApiKey: s.openaiApiKey,
      openaiModel: s.openaiModel,
      puterAuthToken: s.puterAuthToken,
      puterModel: s.puterModel,
    })),
  );

  const rows = buildAgentConfigRows(
    settings,
    agent,
    pendingApprovals,
    wsConnected,
  );

  return (
    <dl className="divide-y px-4">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-3 py-2.5 text-sm"
        >
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            {row.label}
            <InfoTooltip content={row.tooltip} />
          </dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
      {showSettingsLink && (
        <div className="py-3">
          <Link
            href="/dashboard/settings"
            className="text-xs font-medium text-primary hover:underline"
          >
            Edit in Settings →
          </Link>
        </div>
      )}
    </dl>
  );
}
