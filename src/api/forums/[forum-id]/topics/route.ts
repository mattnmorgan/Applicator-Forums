import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// POST /api/forums/forums/:forumId/topics — create a topic
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

    const topics = context.recordManager<TopicRecord>("forums", "topic");

    // Determine next order value within the section (or unsectioned)
    const sectionId = body.sectionId || null;
    const filter = sectionId
      ? { filters: [{ field: "forumId", operator: "=" as const, value: forumId }, { field: "sectionId", operator: "=" as const, value: sectionId }] }
      : { fields: { forumId } };
    const existing = await topics.readRecords({ ...filter, limit: 500 });
    const maxOrder = existing.records.reduce((max, t) => Math.max(max, t.data.order ?? 0), -1);

    const table = await topics.getTable();
    const record = await topics.createRecord(table, {
      forumId,
      sectionId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      hasIcon: false,
      order: maxOrder + 1,
      locked: false,
      lastPostDate: null,
      lastPostUserId: null,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
