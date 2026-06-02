import type { HealRecord } from "./types.js";

interface TeamsLogger {
  warn?(obj: object, msg?: string): void;
  error?(obj: object, msg?: string): void;
}

const ISSUE_LABELS: Record<string, string> = {
  CrashLoop: "CrashLoopBackOff",
  OOM: "OOM (Out of Memory)",
  Pending: "Pending",
  ImagePull: "ImagePullBackOff",
  NodePressure: "Node Pressure",
  MultiVolumeAttachment: "Multi-Volume Attachment",
};

const ACTION_LABELS: Record<string, string> = {
  restart: "Restart pod",
  "patch-memory": "Increase memory limit",
  rollback: "Rollback deployment",
  escalate: "Escalate",
  "fix-secret": "Fix secret",
  "patch-cpu": "Patch CPU",
  scale: "Scale",
};

export interface TeamsCardFact {
  title: string;
  value: string;
}

export interface TeamsAdaptiveCardInput {
  summary: string;
  title: string;
  subtitle?: string;
  facts: TeamsCardFact[];
}

export function formatIssueLabel(issueType: string): string {
  return ISSUE_LABELS[issueType] ?? issueType;
}

export function formatHealFixDescription(record: HealRecord): string {
  const action = String(record.actionTaken);
  const after = record.afterState ?? {};
  const before = record.beforeState ?? {};

  switch (action) {
    case "patch-memory": {
      const prev =
        (typeof after.memoryLimitBefore === "string"
          ? after.memoryLimitBefore
          : null) ??
        (typeof before.memoryLimit === "string" ? before.memoryLimit : null) ??
        "previous limit";
      const next =
        typeof after.memoryLimit === "string" ? after.memoryLimit : "new limit";
      const rollout =
        after.rolloutComplete === true
          ? " Rollout completed."
          : after.rolloutComplete === false
            ? " Rollout still in progress."
            : "";
      const controller =
        typeof after.workloadKind === "string" && typeof after.workload === "string"
          ? ` ${after.workloadKind}/${after.workload}.`
          : typeof after.deployment === "string"
            ? ` Deployment: ${after.deployment}.`
            : "";
      return `Increased memory limit from ${prev} to ${next}.${controller}${rollout}`;
    }
    case "restart":
      return "Deleted the pod to trigger recreation and confirmed it became ready.";
    case "rollback": {
      const deploy =
        typeof after.deployment === "string" ? after.deployment : "deployment";
      return `Rolled back ${deploy} to the previous revision.${
        after.rolledBack === true ? " Rollout completed." : ""
      }`;
    }
    case "escalate":
      return "Issue escalated to on-call (Slack / PagerDuty when configured).";
    default:
      return `Action taken: ${ACTION_LABELS[action] ?? action}`;
  }
}

export function formatHealTrigger(
  record: HealRecord,
  approverDisplayName?: string | null,
): string {
  if (record.approvedBy) {
    const who = approverDisplayName?.trim() || "approved user";
    return `Manual — ${who}`;
  }
  if (record.beforeState?.safeToAutoHeal) {
    return "Auto-heal";
  }
  return "Auto-heal";
}

const MAX_FACT_CHARS = 500;

function truncateFact(value: string): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_FACT_CHARS) return t;
  return `${t.slice(0, MAX_FACT_CHARS)}…`;
}

export function buildHealTeamsCard(
  record: HealRecord,
  clusterName: string,
  approverDisplayName?: string | null,
): TeamsAdaptiveCardInput {
  const fixedAt = new Date(
    (record.createdAt?.getTime() ?? Date.now()) + record.durationMs,
  ).toISOString();

  const deployment =
    typeof record.beforeState?.deploymentName === "string"
      ? record.beforeState.deploymentName
      : typeof record.afterState.deployment === "string"
        ? record.afterState.deployment
        : null;

  const facts: TeamsCardFact[] = [
    { title: "Cluster", value: truncateFact(clusterName) },
    { title: "Pod", value: truncateFact(record.podName) },
    { title: "Namespace", value: truncateFact(record.namespace) },
    { title: "Issue", value: truncateFact(formatIssueLabel(record.issueType)) },
    {
      title: "How it was fixed",
      value: truncateFact(formatHealFixDescription(record)),
    },
    { title: "Time of fix", value: truncateFact(fixedAt) },
    {
      title: "Triggered",
      value: truncateFact(formatHealTrigger(record, approverDisplayName)),
    },
    {
      title: "Severity",
      value: truncateFact(record.severity),
    },
    {
      title: "Action",
      value: truncateFact(
        ACTION_LABELS[String(record.actionTaken)] ?? record.actionTaken,
      ),
    },
    {
      title: "Duration",
      value: truncateFact(`${Math.round(record.durationMs / 1000)}s`),
    },
    { title: "Heal ID", value: truncateFact(record.id) },
  ];

  if (deployment) {
    facts.splice(4, 0, { title: "Deployment", value: deployment });
  }

  return {
    summary: `KubeHealer: ${record.namespace}/${record.podName} healed`,
    title: "Pod healed successfully",
    subtitle: `${clusterName} · ${record.namespace}/${record.podName}`,
    facts,
  };
}

export async function sendTeamsAdaptiveCard(
  webhookUrl: string,
  card: TeamsAdaptiveCardInput,
  opts?: { timeoutMs?: number; log?: TeamsLogger },
): Promise<{ ok: boolean; message: string }> {
  const factsMap = new Map(card.facts.map((f) => [f.title, f.value]));
  const cluster = factsMap.get("Cluster");
  const pod = factsMap.get("Pod");
  const namespace = factsMap.get("Namespace");
  const issue = factsMap.get("Issue");
  const fixedHow = factsMap.get("How it was fixed");
  const fixedTime = factsMap.get("Time of fix");
  const triggered = factsMap.get("Triggered");
  const severity = factsMap.get("Severity");
  const action = factsMap.get("Action");
  const duration = factsMap.get("Duration");
  const healId = factsMap.get("Heal ID");
  const deployment = factsMap.get("Deployment");

  const isHealResolution = Boolean(cluster && pod);

  const metadataFacts = [
    { title: "Cluster", value: cluster || "" },
    { title: "Namespace", value: namespace || "" },
    { title: "Pod", value: pod || "" },
    ...(deployment ? [{ title: "Deployment", value: deployment }] : []),
    { title: "Severity", value: severity || "" },
    { title: "Triggered", value: triggered || "" },
    { title: "Duration", value: duration || "" },
  ].filter((f) => f.value);

  const adaptiveBody = isHealResolution
    ? [
        {
          type: "Container",
          style: "good",
          items: [
            {
              type: "TextBlock",
              text: "🛡️ KUBEHEALER RESOLUTION",
              weight: "Bolder",
              size: "Small",
              color: "Good",
            },
            {
              type: "TextBlock",
              text: card.title || "Pod Healed Successfully",
              weight: "Bolder",
              size: "Large",
              spacing: "None",
            },
            ...(card.subtitle
              ? [
                  {
                    type: "TextBlock",
                    text: card.subtitle,
                    wrap: true,
                    isSubtle: true,
                    spacing: "Small",
                  },
                ]
              : []),
          ],
        },
        {
          type: "Container",
          style: "emphasis",
          spacing: "Medium",
          items: [
            {
              type: "FactSet",
              facts: metadataFacts,
            },
          ],
        },
        {
          type: "Container",
          spacing: "Medium",
          items: [
            {
              type: "TextBlock",
              text: `**Issue:** ${issue || "Unknown Issue"}`,
              weight: "Bolder",
            },
            {
              type: "TextBlock",
              text: `**Action:** ${action || "Remediation"}`,
              weight: "Bolder",
              spacing: "Small",
            },
            {
              type: "TextBlock",
              text: fixedHow || "No details available.",
              wrap: true,
              spacing: "Small",
            },
          ],
        },
        {
          type: "TextBlock",
          text: `Heal ID: ${healId}  •  Resolved at: ${fixedTime}`,
          size: "Small",
          isSubtle: true,
          spacing: "Medium",
        },
      ]
    : [
        {
          type: "TextBlock",
          text: card.title,
          weight: "Bolder",
          size: "Large",
        },
        ...(card.subtitle
          ? [
              {
                type: "TextBlock",
                text: card.subtitle,
                wrap: true,
                isSubtle: true,
                spacing: "Small",
              },
            ]
          : []),
        {
          type: "FactSet",
          facts: card.facts.map((f) => ({
            title: f.title,
            value: f.value,
          })),
          spacing: "Medium",
        },
      ];

  const body = {
    type: "message",
    style: "emphasis",
    summary: card.summary,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: adaptiveBody,
        },
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Teams webhook failed: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      );
    }

    return { ok: true, message: "Notification sent to Microsoft Teams." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Teams notification failed";
    opts?.log?.error?.({ err }, "teams notification failed");
    return { ok: false, message: msg };
  }
}

export async function sendTeamsHealNotification(
  webhookUrl: string,
  record: HealRecord,
  clusterName: string,
  approverDisplayName?: string | null,
  log?: TeamsLogger,
): Promise<boolean> {
  const card = buildHealTeamsCard(record, clusterName, approverDisplayName);
  const result = await sendTeamsAdaptiveCard(webhookUrl, card, { log });
  if (!result.ok) {
    log?.warn?.({ healId: record.id }, result.message);
  }
  return result.ok;
}
