const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  const res = await fetch(`${API_BASE}/api/setup/status`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Unable to reach the Cognix agent");
  }
  return (await res.json()) as SetupStatusResponse;
}

export async function checkDatabaseConnection(): Promise<CheckDbResponse> {
  const res = await fetch(`${API_BASE}/api/setup/check-db`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Unable to reach the Cognix agent");
  }
  return (await res.json()) as CheckDbResponse;
}

export async function applyDatabaseSchema(): Promise<ApplySchemaResponse> {
  const res = await fetch(`${API_BASE}/api/setup/apply-schema`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    let message = "Failed to create database schema";
    try {
      const body = (await res.json()) as { detail?: string; error?: string };
      message = body.detail ?? body.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as ApplySchemaResponse;
}
