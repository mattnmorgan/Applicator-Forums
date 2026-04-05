import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { MessageRecord } from "@/src/types/MessageRecord";
import { ThreadAccessRecord } from "@/src/types/ThreadAccessRecord";
import { TopicAccessRecord } from "@/src/types/TopicAccessRecord";
import { getForumAccess, canPost, canModerate, canUserAccessTopic, getUserAuthorityId } from "@/src/lib/forum-access";

async function upsertTopicAccess(
  context: ApiContext,
  topicId: string,
  forumId: string,
  userId: string,
) {
  const now = Date.now();
  const rm = context.recordManager<TopicAccessRecord>("forums", "topic_access");
  const existing = await rm.readRecords({
    filters: [
      { field: "topicId", operator: "=", value: topicId },
      { field: "userId", operator: "=", value: userId },
    ],
    limit: 1,
  });
  const table = await rm.getTable();
  if (existing.records.length > 0) {
    await rm.updateRecord(table, existing.records[0].id, { accessedAt: now });
  } else {
    await rm.createRecord(table, { topicId, forumId, userId, accessedAt: now });
  }
}

const PAGE_SIZE = 100;

// GET /api/forums/topics/:topicId/threads — list threads (paginated, pinned first)
export async function GET(
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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const threads = context.recordManager<ThreadRecord>("forums", "thread");
  const messagesRm = context.recordManager<MessageRecord>("forums", "message");
  const userMgr = context.recordManager("system", "users");
  const accessRm = context.recordManager<ThreadAccessRecord>("forums", "thread_access");

  // Get pinned threads (no pagination)
  const pinnedResult = await threads.readRecords({
    filters: [
      { field: "topicId", operator: "=", value: topicId },
      { field: "pinned", operator: "=", value: true },
    ],
  });

  // Get unpinned threads (paginated, by lastPostDate DESC)
  const unpinnedResult = await threads.readRecords({
    filters: [
      { field: "topicId", operator: "=", value: topicId },
      { field: "pinned", operator: "!=", value: true },
    ],
    limit: PAGE_SIZE,
    offset,
  });

  // Mark the user as having visited this topic (for forum-level unread indicator)
  upsertTopicAccess(context, topicId, topic.data.forumId, access.userId).catch(() => {});

  // Load all thread_access records for the current user in this topic
  const accessResult = await accessRm.readRecords({
    filters: [
      { field: "userId", operator: "=", value: access.userId },
      { field: "topicId", operator: "=", value: topicId },
    ],
    limit: 500,
  });
  const accessMap = new Map<string, number>();
  for (const a of accessResult.records) {
    accessMap.set(a.data.threadId, a.data.accessedAt);
  }

  const enrichThread = async (t: { id: string; data: ThreadRecord; created_at: number }) => {
    const creator = await userMgr.readRecord(t.data.createdBy) as any;
    const createdByProfilePicture = creator?.data.icon
      ? `/api/system/assets/icons/users/${t.data.createdBy}` : null;
    let lastPostUserName: string | null = null;
    let lastPostUserProfilePicture: string | null = null;
    if (t.data.lastPostUserId) {
      const u = await userMgr.readRecord(t.data.lastPostUserId) as any;
      lastPostUserName = u?.data.display_name || u?.data.username || null;
      lastPostUserProfilePicture = u?.data.icon
        ? `/api/system/assets/icons/users/${t.data.lastPostUserId}` : null;
    }
    const msgResult = await messagesRm.readRecords({ fields: { threadId: t.id }, limit: 1 });
    return {
      id: t.id,
      name: t.data.name,
      description: t.data.description || "",
      createdBy: t.data.createdBy,
      createdByName: creator?.data.display_name || creator?.data.username || t.data.createdBy,
      createdByProfilePicture,
      createdAt: t.created_at,
      pinned: !!t.data.pinned,
      locked: !!t.data.locked,
      lastPostDate: t.data.lastPostDate || null,
      lastPostUserId: t.data.lastPostUserId || null,
      lastPostUserName,
      lastPostUserProfilePicture,
      messageCount: msgResult.total,
      lastReadAt: accessMap.get(t.id) ?? null,
    };
  };

  const [pinned, unpinned] = await Promise.all([
    Promise.all(pinnedResult.records.map(enrichThread)),
    Promise.all(unpinnedResult.records.map(enrichThread)),
  ]);

  // Sort pinned by lastPostDate DESC (or createdAt DESC)
  pinned.sort((a, b) => (b.lastPostDate || b.createdAt) - (a.lastPostDate || a.createdAt));
  // Sort unpinned by lastPostDate DESC
  unpinned.sort((a, b) => (b.lastPostDate || b.createdAt) - (a.lastPostDate || a.createdAt));

  const totalUnpinned = unpinnedResult.total;
  const totalPages = Math.max(1, Math.ceil(totalUnpinned / PAGE_SIZE));

  return NextResponse.json({
    topic: {
      id: topic.id,
      name: topic.data.name,
      hasIcon: !!topic.data.hasIcon,
      locked: !!topic.data.locked,
      forumId: topic.data.forumId,
      forumName: access.forum.data.name,
      forumHasIcon: !!access.forum.data.hasIcon,
    },
    access: access.level,
    currentUserId: access.userId,
    pinned,
    threads: unpinned,
    total: totalUnpinned,
    page,
    totalPages,
  });
}

// POST /api/forums/topics/:topicId/threads — create a thread
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

  if (!canPost(access.level)) {
    return NextResponse.json({ error: "Forbidden — you do not have post permissions" }, { status: 403 });
  }
  if (topic.data.locked && !canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden — this topic is locked" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const user = await context.user();
    const threads = context.recordManager<ThreadRecord>("forums", "thread");
    const table = await threads.getTable();
    const record = await threads.createRecord(table, {
      topicId,
      forumId: topic.data.forumId,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      createdBy: user!.id,
      pinned: false,
      locked: false,
      lastPostDate: null,
      lastPostUserId: null,
    });

    // Create the initial message if content was provided
    if (body.content?.trim()) {
      const now = Date.now();
      const messages = context.recordManager<MessageRecord>("forums", "message");
      const msgTable = await messages.getTable();
      await messages.createRecord(msgTable, {
        threadId: record.id,
        forumId: topic.data.forumId,
        content: body.content.trim(),
        authorId: user!.id,
        edited: false,
        editedAt: null,
        removed: false,
      });
      const threadTable = await threads.getTable();
      await threads.updateRecord(threadTable, record.id, {
        lastPostDate: now,
        lastPostUserId: user!.id,
      });
      const topicTable = await topics.getTable();
      await topics.updateRecord(topicTable, topic.id, {
        lastPostDate: now,
        lastPostUserId: user!.id,
      });
    }

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
