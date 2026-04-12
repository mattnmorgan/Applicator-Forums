import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import { TopicSubscriptionRecord } from "@/src/types/TopicSubscriptionRecord";
import { getForumAccess, canModerate, canUserAccessTopic, getUserAuthorityId } from "@/src/lib/forum-access";

// GET /api/forums/topics/:topicId/subscription — check subscription status
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
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (topic.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subs = context.recordManager<TopicSubscriptionRecord>("forums", "topic_subscription");
  const existing = await subs.readRecords({
    filters: [
      { field: "topicId", operator: "=", value: topicId },
      { field: "userId", operator: "=", value: access.userId },
    ],
    limit: 1,
  });

  return NextResponse.json({ subscribed: existing.records.length > 0 });
}

// POST /api/forums/topics/:topicId/subscription — toggle subscription
export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { topicId: string },
) {
  const { topicId } = params;
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(topicId);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, topic.data.forumId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (topic.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const subscribe = !!body.subscribed;

  const subs = context.recordManager<TopicSubscriptionRecord>("forums", "topic_subscription");
  const existing = await subs.readRecords({
    filters: [
      { field: "topicId", operator: "=", value: topicId },
      { field: "userId", operator: "=", value: access.userId },
    ],
    limit: 1,
  });

  if (subscribe && existing.records.length === 0) {
    const table = await subs.getTable();
    await subs.createRecord(table, {
      topicId,
      forumId: topic.data.forumId,
      userId: access.userId,
    });
  } else if (!subscribe && existing.records.length > 0) {
    await subs.deleteRecord(existing.records[0].id);
  }

  return NextResponse.json({ subscribed: subscribe });
}
