import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { SectionRecord } from "@/src/types/SectionRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// PATCH /api/forums/sections/:sectionId — rename a section
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { sectionId: string },
) {
  const { sectionId } = params;
  const sections = context.recordManager<SectionRecord>("forums", "section");
  const section = await sections.readRecord(sectionId);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, section.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const table = await sections.getTable();
    const updated = await sections.updateRecord(table, sectionId, { name: body.name.trim() });
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/sections/:sectionId — delete section, move topics to unsectioned
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { sectionId: string },
) {
  const { sectionId } = params;
  const sections = context.recordManager<SectionRecord>("forums", "section");
  const section = await sections.readRecord(sectionId);
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, section.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const topics = context.recordManager<TopicRecord>("forums", "topic");
    const topicsInSection = await topics.readRecords({ fields: { sectionId }, limit: 500 });

    await context.withTransaction(async (client) => {
      const topicTable = await topics.getTable();
      // Move topics to unsectioned (null sectionId)
      for (const t of topicsInSection.records) {
        await topics.updateRecord(topicTable, t.id, { sectionId: null } as any, { client });
      }
      await sections.deleteRecord(sectionId, { client });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
