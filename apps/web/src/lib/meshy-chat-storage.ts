import type { MeshyChatRetention } from "@/stores/settings";

export interface StoredMeshyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  inputNote?: string;
  uiCard?: {
    type: string;
    data: unknown;
  };
}

interface StoredMeshyChat {
  savedAt: number;
  messages: StoredMeshyMessage[];
}

const STORAGE_PREFIX = "meshy-chat-";

export function meshyChatRetentionMs(retention: MeshyChatRetention): number {
  const multipliers = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  } as const;
  return Math.max(1, retention.value) * multipliers[retention.unit];
}

export function formatMeshyChatRetention(retention: MeshyChatRetention): string {
  const unit =
    retention.value === 1
      ? retention.unit.replace(/s$/, "")
      : retention.unit;
  return `${retention.value} ${unit}`;
}

export function loadMeshyChatMessages(
  clusterId: string | null | undefined,
  retention: MeshyChatRetention,
): StoredMeshyMessage[] | null {
  if (typeof window === "undefined" || !clusterId) return null;

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${clusterId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredMeshyChat;
    if (!Array.isArray(parsed.messages) || typeof parsed.savedAt !== "number") {
      localStorage.removeItem(`${STORAGE_PREFIX}${clusterId}`);
      return null;
    }

    if (Date.now() - parsed.savedAt > meshyChatRetentionMs(retention)) {
      localStorage.removeItem(`${STORAGE_PREFIX}${clusterId}`);
      return null;
    }

    return parsed.messages;
  } catch {
    return null;
  }
}

export function saveMeshyChatMessages(
  clusterId: string | null | undefined,
  messages: StoredMeshyMessage[],
): void {
  if (typeof window === "undefined" || !clusterId) return;

  const payload: StoredMeshyChat = {
    savedAt: Date.now(),
    messages,
  };

  localStorage.setItem(`${STORAGE_PREFIX}${clusterId}`, JSON.stringify(payload));
}

export function clearMeshyChatMessages(clusterId: string | null | undefined): void {
  if (typeof window === "undefined" || !clusterId) return;
  localStorage.removeItem(`${STORAGE_PREFIX}${clusterId}`);
}
