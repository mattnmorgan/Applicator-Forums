import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

// GET /api/forums/authorities — list system authorities for grant UI
export async function GET(_req: NextRequest, context: ApiContext) {
  const user = await context.user();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authMgr = context.recordManager("system", "authorities");
  const result = await authMgr.readRecords({ limit: 200 });

  const authorities = result.records
    .filter((a: any) => !a.data.user_id && !a.data.contextual)
    .map((a: any) => ({ id: a.id, name: a.data.name }));

  return NextResponse.json({ authorities });
}
