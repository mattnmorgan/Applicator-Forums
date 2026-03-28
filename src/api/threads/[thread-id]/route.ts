import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// PATCH /api/forums/threads/:threadId — update a thread
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { threadId: string },
) {
  const { threadId } = params;
  const threads = context.recordManager<ThreadRecord>("forums", "thread");
  const thread = await threads.readRecord(threadId);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, thread.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isCreator = thread.data.createdBy === user?.id;

  if (!isModerator && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updates: Partial<ThreadRecord> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    // Only moderators can pin/lock threads
    if (body.pinned !== undefined && isModerator) updates.pinned = !!body.pinned;
    if (body.locked !== undefined && isModerator) updates.locked = !!body.locked;

    const table = await threads.getTable();
    const updated = await threads.updateRecord(table, threadId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/threads/:threadId — delete thread and its messages
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { threadId: string },
) {
  const { threadId } = params;
  const threads = context.recordManager<ThreadRecord>("forums", "thread");
  const thread = await threads.readRecord(threadId);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, thread.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isCreator = thread.data.createdBy === user?.id;

  if (!isModerator && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const messages = context.recordManager("forums", "message");

    await context.withTransaction(async (client) => {
      await messages.deleteFilteredRecords({ fields: { threadId } }, { client });
      await threads.deleteRecord(threadId, { client });
    });

    // Update topic's lastPostDate to reflect the deletion
    const topics = context.recordManager("forums", "topic");
    const topicId = thread.data.topicId;
    const remainingThreads = await threads.readRecords({ fields: { topicId }, limit: 1 });
    if (remainingThreads.records.length === 0) {
      const topicTable = await topics.getTable();
      await topics.updateRecord(topicTable, topicId, {
        lastPostDate: null,
        lastPostUserId: null,
      } as any);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
