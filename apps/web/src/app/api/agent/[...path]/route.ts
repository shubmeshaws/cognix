import { NextResponse } from "next/server";

import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "x-auth-sync-secret",
] as const;

async function proxyToAgent(
  request: Request,
  pathSegments: string[],
): Promise<NextResponse> {
  const base = getAgentInternalBaseUrl();
  const subpath = pathSegments.join("/");
  const url = `${base}/api/${subpath}${new URL(request.url).search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Agent unreachable";
    return NextResponse.json(
      {
        error: "agent_unreachable",
        detail: `${detail} (tried ${url}). Is pnpm dev:agent running?`,
      },
      { status: 502 },
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToAgent(request, path);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToAgent(request, path);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToAgent(request, path);
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToAgent(request, path);
}
