import { NextResponse } from "next/server";

import { createAgentToken } from "@/lib/agent-token";
import { isAuthDisabled } from "@/lib/auth-disabled";
import { DEV_USER_ID } from "@/lib/dev-user";

export async function GET() {
  if (!isAuthDisabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = await createAgentToken(DEV_USER_ID);
  return NextResponse.json({ token, userId: DEV_USER_ID });
}
