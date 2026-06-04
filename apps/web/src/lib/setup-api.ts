import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

export interface SetupStatusResponse {
  dbConnected: boolean;
  dbDetail: string;
  schemaPresent: boolean;
  schemaDetail: string;
  adminPresent: boolean;
  readyForLogin: boolean;
  initialSetupComplete: boolean;
}

export interface CheckDbResponse {
  ok: boolean;
  detail: string;
}

export interface ApplySchemaResponse {
  ok: boolean;
  alreadyPresent: boolean;
  detail: string;
}

/** Browser: same-origin proxy. Server (RSC): talk to agent on localhost. */
function setupApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/setup";
  }
  return `${getAgentInternalBaseUrl()}/api/setup`;
}

async function readSetupError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  const res = await fetch(`${setupApiBase()}/status`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await readSetupError(res, "Unable to reach the Cognix agent"));
  }
  return (await res.json()) as SetupStatusResponse;
}

export async function checkDatabaseConnection(): Promise<CheckDbResponse> {
  const res = await fetch(`${setupApiBase()}/check-db`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readSetupError(res, "Unable to reach the Cognix agent"));
  }
  return (await res.json()) as CheckDbResponse;
}

export async function applyDatabaseSchema(): Promise<ApplySchemaResponse> {
  const res = await fetch(`${setupApiBase()}/apply-schema`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readSetupError(res, "Failed to create database schema"));
  }
  return (await res.json()) as ApplySchemaResponse;
}
