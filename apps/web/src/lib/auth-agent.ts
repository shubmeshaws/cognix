const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface AgentLoginResult {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
}

export interface BootstrapAdminResult {
  email: string;
  username: string;
  password: string;
  name: string;
}

export async function fetchAuthSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await fetch(`${API_BASE}/api/auth/setup-status`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return { needsSetup: false };
  }
  return (await res.json()) as { needsSetup: boolean };
}

export async function bootstrapAdminWithAgent(): Promise<BootstrapAdminResult> {
  const res = await fetch(`${API_BASE}/api/auth/bootstrap-admin`, {
    method: "POST",
    cache: "no-store",
  });

  if (!res.ok) {
    let message = "Failed to generate admin credentials";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      message = await res.text();
    }
    throw new Error(message);
  }

  return (await res.json()) as BootstrapAdminResult;
}

export async function loginWithAgentCredentials(input: {
  emailOrUsername: string;
  password: string;
}): Promise<AgentLoginResult | null> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as AgentLoginResult;
}

export async function syncOAuthUserWithAgent(input: {
  provider: "google" | "github";
  providerId: string;
  email: string;
  name: string;
}): Promise<AgentLoginResult> {
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const res = await fetch(`${API_BASE}/api/auth/oauth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Sync-Secret": secret,
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "OAuth sync failed");
  }

  return (await res.json()) as AgentLoginResult;
}

export async function changePasswordWithAgent(
  token: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let message = "Failed to change password";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      message = await res.text();
    }
    throw new Error(message);
  }

  return (await res.json()) as { token: string };
}
