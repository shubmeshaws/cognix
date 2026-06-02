import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { isAuthDisabled } from "@/lib/auth-disabled";

export async function GET(req: NextRequest) {
  if (isAuthDisabled()) {
    return NextResponse.json(null);
  }
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  if (isAuthDisabled()) {
    return NextResponse.json({ error: "Auth is disabled" }, { status: 403 });
  }
  return handlers.POST(req);
}
