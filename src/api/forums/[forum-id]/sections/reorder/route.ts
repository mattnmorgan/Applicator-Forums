import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { SectionRecord } from "@/src/types/SectionRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// POST /api/forums/forums/:forumId/sections/reorder — reorder sections
export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // body.sections: [{ id, order }]
    if (!Array.isArray(body.sections)) {
      return NextResponse.json({ error: "sections array is required" }, { status: 400 });
    }

    const sections = context.recordManager<SectionRecord>("forums", "section");
    const table = await sections.getTable();

    await context.withTransaction(async (client) => {
      for (const { id, order } of body.sections) {
        await sections.updateRecord(table, id, { order }, { client });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
