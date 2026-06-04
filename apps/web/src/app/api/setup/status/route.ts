import { NextResponse } from "next/server";

import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

export async function GET(): Promise<NextResponse> {
  const base = getAgentInternalBaseUrl();
  try {
    const res = await fetch(`${base}/api/setup/status`, { cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Agent unreachable";
    return NextResponse.json(
      {
        error: "agent_unreachable",
        detail: `${detail} (tried ${base}/api/setup/status). Is pnpm dev:agent running?`,
      },
      { status: 502 },
    );
  }
}
