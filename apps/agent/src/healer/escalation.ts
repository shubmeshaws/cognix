import type { Env } from "../config/env.js";
import type { HealRecord } from "./types.js";

interface EscalationLogger {
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export async function sendSlackAlert(
  env: Env,
  healRecord: HealRecord,
  message: string,
  log?: EscalationLogger,
): Promise<boolean> {
  if (!env.SLACK_WEBHOOK_URL) {
    log?.warn({}, "SLACK_WEBHOOK_URL not configured");
    return false;
  }

  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*KubeHealer escalation*\n*Cluster:* ${healRecord.clusterId}\n*Pod:* ${healRecord.namespace}/${healRecord.podName}\n*Issue:* ${healRecord.issueType}\n*Action:* ${healRecord.actionTaken}\n${message}`,
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Slack webhook failed: ${res.status}`);
    }
    return true;
  } catch (err) {
    log?.error({ err }, "slack notification failed");
    return false;
  }
}

export async function createPagerDutyIncident(
  env: Env,
  healRecord: HealRecord,
  summary: string,
  log?: EscalationLogger,
): Promise<boolean> {
  if (!env.PAGERDUTY_INTEGRATION_KEY) {
    log?.warn({}, "PAGERDUTY_INTEGRATION_KEY not configured");
    return false;
  }

  try {
    const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: env.PAGERDUTY_INTEGRATION_KEY,
        event_action: "trigger",
        dedup_key: `kubehealer-${healRecord.id}`,
        payload: {
          summary,
          source: "kubehealer",
          severity: healRecord.severity === "critical" ? "critical" : "error",
          custom_details: {
            clusterId: healRecord.clusterId,
            namespace: healRecord.namespace,
            podName: healRecord.podName,
            issueType: healRecord.issueType,
            action: healRecord.actionTaken,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PagerDuty API failed: ${res.status} ${body}`);
    }
    return true;
  } catch (err) {
    log?.error({ err }, "pagerduty notification failed");
    return false;
  }
}
