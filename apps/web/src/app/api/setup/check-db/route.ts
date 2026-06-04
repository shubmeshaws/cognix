import { NextResponse } from "next/server";

import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

export async function POST(): Promise<NextResponse> {
  const base = getAgentInternalBaseUrl();
  try {
    const res = await fetch(`${base}/api/setup/check-db`, {
      method: "POST",
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Agent unreachable";
    return NextResponse.json(
      {
        ok: false,
        detail: `${detail} (tried ${base}). Start agent: pnpm dev:agent`,
      },
      { status: 502 },
    );
  }
}
