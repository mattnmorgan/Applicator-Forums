import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// GET /api/forums/topics/:topicId — get topic info (for header on topic detail page)
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { topicId: string },
) {
  const { topicId } = params;
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(topicId);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, topic.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  return NextResponse.json({
    id: topic.id,
    name: topic.data.name,
    description: topic.data.description || "",
    hasIcon: !!topic.data.hasIcon,
    sectionId: topic.data.sectionId || null,
    forumId: topic.data.forumId,
    forumName: access.forum.data.name,
    locked: !!topic.data.locked,
    access: access.level,
    currentUserId: access.userId,
  });
}

// PATCH /api/forums/topics/:topicId — update a topic
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { topicId: string },
) {
  const { topicId } = params;
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(topicId);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, topic.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updates: Partial<TopicRecord> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.sectionId !== undefined) updates.sectionId = body.sectionId || null;
    if (body.order !== undefined) updates.order = body.order;
    if (body.locked !== undefined) updates.locked = !!body.locked;

    const table = await topics.getTable();
    const updated = await topics.updateRecord(table, topicId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/topics/:topicId — delete topic and all threads/messages
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { topicId: string },
) {
  const { topicId } = params;
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(topicId);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, topic.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const messages = context.recordManager("forums", "message");
    const threads = context.recordManager("forums", "thread");

    // Get all thread IDs in this topic to delete their messages
    const threadsResult = await threads.readRecords({ fields: { topicId }, limit: 2000 });
    const threadIds = threadsResult.records.map((t) => t.id);

    await context.withTransaction(async (client) => {
      if (threadIds.length > 0) {
        await messages.deleteFilteredRecords(
          { filters: [{ field: "threadId", operator: "IN", value: threadIds }] },
          { client },
        );
      }
      await threads.deleteFilteredRecords({ fields: { topicId } }, { client });
      await topics.deleteRecord(topicId, { client });
    });

    // Delete topic icon if present
    try {
      await context.appFileManager.deleteFile(`icons/topics/${topicId}.jpg`);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
