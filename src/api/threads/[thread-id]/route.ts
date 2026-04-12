import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate, canUserAccessTopic, getUserAuthorityId } from "@/src/lib/forum-access";

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
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isCreator = thread.data.createdBy === user?.id;

  if (!isModerator && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isModerator) {
    const parentTopic = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
    if (parentTopic?.data.restricted) {
      const userAuthorityId = await getUserAuthorityId(context, access.userId);
      const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const updates: Partial<ThreadRecord> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    // Only moderators can pin/lock/move threads
    if (body.pinned !== undefined && isModerator) updates.pinned = !!body.pinned;
    if (body.locked !== undefined && isModerator) updates.locked = !!body.locked;

    // Move thread to a different topic (moderator only)
    if (body.topicId !== undefined && isModerator) {
      const targetTopicId = body.topicId as string;
      if (targetTopicId === thread.data.topicId) {
        return NextResponse.json({ error: "Thread is already in that topic" }, { status: 400 });
      }
      const targetTopic = await context.recordManager<TopicRecord>("forums", "topic").readRecord(targetTopicId);
      if (!targetTopic) {
        return NextResponse.json({ error: "Target topic not found" }, { status: 404 });
      }
      if (targetTopic.data.forumId !== thread.data.forumId) {
        return NextResponse.json({ error: "Target topic is in a different forum" }, { status: 400 });
      }
      updates.topicId = targetTopicId;
    }

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
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isCreator = thread.data.createdBy === user?.id;

  if (!isModerator && !isCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isModerator) {
    const parentTopic = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
    if (parentTopic?.data.restricted) {
      const userAuthorityId = await getUserAuthorityId(context, access.userId);
      const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const messages = context.recordManager("forums", "message");
    const threadAccess = context.recordManager("forums", "thread_access");
    const threadSubs = context.recordManager("forums", "thread_subscription");

    await context.withTransaction(async (client: any) => {
      await messages.deleteFilteredRecords({ fields: { threadId } }, { client });
      await threadAccess.deleteFilteredRecords({ fields: { threadId } }, { client });
      await threadSubs.deleteFilteredRecords({ fields: { threadId } }, { client });
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
