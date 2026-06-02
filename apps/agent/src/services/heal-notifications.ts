import { eq } from "drizzle-orm";

import type { ServerDeps } from "../context/deps.js";
import { clusters, healRecords, users } from "../db/schema.js";
import { mapHealRecord } from "../healer/orchestrator.js";
import { sendTeamsHealNotification } from "../healer/teams-notify.js";
import type { HealRecord } from "../healer/types.js";
import { getEffectiveTeamsWebhookUrl } from "./teams-config.js";

interface NotifyLogger {
  info?(obj: object, msg?: string): void;
  warn?(obj: object, msg?: string): void;
  error?(obj: object, msg?: string): void;
}

/** Sends Microsoft Teams notification when a heal completes successfully. */
export async function notifyHealCompleted(
  deps: ServerDeps,
  healRecord: HealRecord,
  log?: NotifyLogger,
): Promise<void> {
  const webhookUrl = getEffectiveTeamsWebhookUrl(deps.env);
  if (!webhookUrl) {
    log?.warn?.(
      { healId: healRecord.id, status: healRecord.status },
      "teams notification skipped — webhook not configured (save URL in Settings)",
    );
    return;
  }

  const [row] = await deps.db
    .select()
    .from(healRecords)
    .where(eq(healRecords.id, healRecord.id))
    .limit(1);

  const record = row ? mapHealRecord(row) : healRecord;

  if (record.status !== "healed") {
    log?.info?.(
      { healId: record.id, status: record.status },
      "teams notification skipped — heal status is not healed",
    );
    return;
  }

  const [cluster] = await deps.db
    .select({ name: clusters.name })
    .from(clusters)
    .where(eq(clusters.id, record.clusterId))
    .limit(1);

  let approverDisplayName: string | null = null;
  if (record.approvedBy) {
    const [user] = await deps.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, record.approvedBy))
      .limit(1);
    approverDisplayName = user?.name ?? user?.email ?? null;
  }

  const clusterName = cluster?.name ?? record.clusterId;

  try {
    const ok = await sendTeamsHealNotification(
      webhookUrl,
      record,
      clusterName,
      approverDisplayName,
      log,
    );
    if (ok) {
      log?.info?.(
        {
          healId: record.id,
          pod: `${record.namespace}/${record.podName}`,
          cluster: clusterName,
        },
        "teams heal notification sent",
      );
    } else {
      log?.warn?.(
        { healId: record.id, pod: `${record.namespace}/${record.podName}` },
        "teams heal notification failed — check agent logs",
      );
    }
  } catch (err) {
    log?.error?.({ err, healId: record.id }, "teams heal notification failed");
  }
}
