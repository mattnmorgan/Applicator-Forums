import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { ThreadSubscriptionRecord } from "@/src/types/ThreadSubscriptionRecord";
import { getForumAccess, canModerate, canUserAccessTopic, getUserAuthorityId } from "@/src/lib/forum-access";

// GET /api/forums/threads/:threadId/subscription — check subscription status
export async function GET(
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

  const topicForCheck = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
  if (topicForCheck?.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Thread creators cannot subscribe — they already receive thread-reply notifications
  if (thread.data.createdBy === access.userId) {
    return NextResponse.json({ subscribed: false, isCreator: true });
  }

  const subs = context.recordManager<ThreadSubscriptionRecord>("forums", "thread_subscription");
  const existing = await subs.readRecords({
    filters: [
      { field: "threadId", operator: "=", value: threadId },
      { field: "userId", operator: "=", value: access.userId },
    ],
    limit: 1,
  });

  return NextResponse.json({ subscribed: existing.records.length > 0, isCreator: false });
}

// POST /api/forums/threads/:threadId/subscription — toggle subscription
export async function POST(
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

  const topicForCheck = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
  if (topicForCheck?.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Thread creators cannot subscribe
  if (thread.data.createdBy === access.userId) {
    return NextResponse.json({ error: "Thread creators are automatically opted into reply notifications" }, { status: 400 });
  }

  const body = await req.json();
  const subscribe = !!body.subscribed;

  const subs = context.recordManager<ThreadSubscriptionRecord>("forums", "thread_subscription");
  const existing = await subs.readRecords({
    filters: [
      { field: "threadId", operator: "=", value: threadId },
      { field: "userId", operator: "=", value: access.userId },
    ],
    limit: 1,
  });

  if (subscribe && existing.records.length === 0) {
    const table = await subs.getTable();
    await subs.createRecord(table, {
      threadId,
      topicId: thread.data.topicId,
      forumId: thread.data.forumId,
      userId: access.userId,
    });
  } else if (!subscribe && existing.records.length > 0) {
    await subs.deleteRecord(existing.records[0].id);
  }

  return NextResponse.json({ subscribed: subscribe });
}
