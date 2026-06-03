import { NextResponse } from "next/server";

import { ensureSupertonicServer } from "@/lib/supertonic-server";

export async function POST() {
  const result = await ensureSupertonicServer();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
