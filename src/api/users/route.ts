import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";

// GET /api/forums/users — list active system users for the share UI
export async function GET(_req: NextRequest, context: ApiContext) {
  const user = await context.user();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userMgr = context.recordManager("system", "users");
  const result = await userMgr.readRecords({
    filters: [{ field: "is_active", operator: "=", value: true }],
    limit: 500,
  });

  const users = result.records
    .map((u: any) => ({
      id: u.id,
      displayName: u.data.display_name || u.data.username || u.id,
      username: u.data.username || u.id,
      profilePicture: u.data.icon ? `/api/system/assets/icons/users/${u.id}` : null,
    }))
    .filter((u) => u.id !== user.id);

  return NextResponse.json({ users });
}
