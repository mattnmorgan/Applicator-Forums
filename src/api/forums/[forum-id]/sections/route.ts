import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { SectionRecord } from "@/src/types/SectionRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// POST /api/forums/forums/:forumId/sections — create a new section
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
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const sections = context.recordManager<SectionRecord>("forums", "section");

    // Determine next order value
    const existing = await sections.readRecords({ fields: { forumId }, limit: 500 });
    const maxOrder = existing.records.reduce((max, s) => Math.max(max, s.data.order ?? 0), -1);

    const table = await sections.getTable();
    const record = await sections.createRecord(table, {
      forumId,
      name: body.name.trim(),
      order: maxOrder + 1,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
