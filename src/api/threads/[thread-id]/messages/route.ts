import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { MessageRecord } from "@/src/types/MessageRecord";
import { ThreadAccessRecord } from "@/src/types/ThreadAccessRecord";
import { getForumAccess, canPost, canModerate, canUserAccessTopic, getUserAuthorityId } from "@/src/lib/forum-access";

async function upsertThreadAccess(
  context: ApiContext,
  threadId: string,
  topicId: string,
  forumId: string,
  userId: string,
) {
  const now = Date.now();
  const rm = context.recordManager<ThreadAccessRecord>(
    "forums",
    "thread_access",
  );
  const existing = await rm.readRecords({
    filters: [
      { field: "threadId", operator: "=", value: threadId },
      { field: "userId", operator: "=", value: userId },
    ],
    limit: 1,
  });
  const table = await rm.getTable();
  if (existing.records.length > 0) {
    await rm.updateRecord(table, existing.records[0].id, { accessedAt: now });
  } else {
    await rm.createRecord(table, {
      threadId,
      topicId,
      forumId,
      userId,
      accessedAt: now,
    });
  }
}

const PAGE_SIZE = 100;

// GET /api/forums/threads/:threadId/messages — list messages (paginated, ascending)
export async function GET(
  req: NextRequest,
  context: ApiContext,
  params: { threadId: string },
) {
  const { threadId } = params;
  const threads = context.recordManager<ThreadRecord>("forums", "thread");
  const thread = await threads.readRecord(threadId);
  if (!thread)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, thread.data.forumId);
  if (!access)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const topicForCheck = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
  if (topicForCheck?.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  const messages = context.recordManager<MessageRecord>("forums", "message");
  const userMgr = context.recordManager("system", "users");

  const [result] = await Promise.all([
    messages.readRecords({
      fields: { threadId },
      limit: PAGE_SIZE,
      offset,
    }),
    upsertThreadAccess(
      context,
      threadId,
      thread.data.topicId,
      thread.data.forumId,
      access.userId,
    ).catch(() => {}),
  ]);

  // Sort by created_at ascending
  const sorted = [...result.records].sort(
    (a, b) => a.created_at - b.created_at,
  );

  const isModerator = access.level === "owner" || access.level === "moderator";

  const enriched = await Promise.all(
    sorted.map(async (m) => {
      let authorName: string | null = null;
      let profilePicture: string | null = null;
      const u = (await userMgr.readRecord(m.data.authorId)) as any;
      if (!m.data.removed) {
        authorName = u?.data.display_name || u?.data.username || null;
        profilePicture = u?.data.icon
          ? `/api/system/assets/icons/users/${m.data.authorId}`
          : null;
      }
      const entry: Record<string, unknown> = {
        id: m.id,
        content: m.data.removed ? "" : m.data.content || "",
        authorId: m.data.authorId,
        authorName,
        profilePicture,
        edited: !!m.data.edited,
        editedAt: m.data.editedAt || null,
        removed: !!m.data.removed,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      };
      // Expose original content to moderators so they can reveal/restore removed messages
      if (isModerator && m.data.removed) {
        entry.originalContent = m.data.content || "";
      }
      return entry;
    }),
  );

  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(thread.data.topicId);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return NextResponse.json({
    thread: {
      id: thread.id,
      name: thread.data.name,
      description: thread.data.description || "",
      locked: !!thread.data.locked,
      pinned: !!thread.data.pinned,
      topicId: thread.data.topicId,
      forumId: thread.data.forumId,
      createdBy: thread.data.createdBy,
    },
    topic: {
      id: topic?.id,
      name: topic?.data.name || "",
      hasIcon: !!topic?.data.hasIcon,
      locked: !!topic?.data.locked,
    },
    forum: {
      id: access.forum.id,
      name: access.forum.data.name,
      hasIcon: !!access.forum.data.hasIcon,
    },
    access: access.level,
    currentUserId: access.userId,
    messages: enriched,
    total: result.total,
    page,
    totalPages,
  });
}

// POST /api/forums/threads/:threadId/messages — post a new message
export async function POST(
  req: NextRequest,
  context: ApiContext,
  params: { threadId: string },
) {
  const { threadId } = params;
  const threads = context.recordManager<ThreadRecord>("forums", "thread");
  const thread = await threads.readRecord(threadId);
  if (!thread)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, thread.data.forumId);
  if (!access)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const topicForCheck = await context.recordManager<TopicRecord>("forums", "topic").readRecord(thread.data.topicId);
  if (topicForCheck?.data.restricted) {
    const userAuthorityId = canModerate(access.level) ? null : await getUserAuthorityId(context, access.userId);
    const allowed = await canUserAccessTopic(context, thread.data.topicId, access.userId, userAuthorityId, access.level);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canPost(access.level)) {
    return NextResponse.json(
      { error: "Forbidden — you do not have post permissions" },
      { status: 403 },
    );
  }
  if (thread.data.locked && !canModerate(access.level)) {
    return NextResponse.json(
      { error: "Forbidden — this thread is locked" },
      { status: 403 },
    );
  }

  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(thread.data.topicId);
  if (topic?.data.locked && !canModerate(access.level)) {
    return NextResponse.json(
      { error: "Forbidden — this topic is locked" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    if (!body.content?.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    const user = await context.user();
    const messages = context.recordManager<MessageRecord>("forums", "message");
    const msgTable = await messages.getTable();

    const now = Date.now();

    const record = await messages.createRecord(msgTable, {
      threadId,
      forumId: thread.data.forumId,
      content: body.content,
      authorId: user!.id,
      edited: false,
      editedAt: null,
      removed: false,
    });

    // Update thread and topic lastPostDate; also mark thread as read for the poster
    const threadTable = await threads.getTable();
    await Promise.all([
      threads.updateRecord(threadTable, threadId, {
        lastPostDate: now,
        lastPostUserId: user!.id,
      }),
      upsertThreadAccess(
        context,
        threadId,
        thread.data.topicId,
        thread.data.forumId,
        user!.id,
      ).catch(() => {}),
    ]);

    if (topic) {
      const topicTable = await topics.getTable();
      await topics.updateRecord(topicTable, topic.id, {
        lastPostDate: now,
        lastPostUserId: user!.id,
      });
    }

    const userMgr = context.recordManager("system", "users");
    const u = (await userMgr.readRecord(user!.id)) as any;

    // Notify the thread creator if someone else replied
    if (thread.data.createdBy !== user!.id) {
      const posterName = u?.data.display_name || u?.data.username || "Someone";
      context
        .sendNotification({
          userId: thread.data.createdBy,
          type: "info",
          title: "New reply to your thread",
          message: `${posterName} replied to "${thread.data.name}" in ${topic?.data.name ?? "a topic"}`,
          url: `/app/forums:main/thread/${thread.data.forumId}/${thread.data.topicId}/${threadId}`,
          topicId: "forums:thread-reply",
        })
        .catch(() => {});
    }

    return NextResponse.json(
      {
        id: record.id,
        content: record.data.content,
        authorId: record.data.authorId,
        authorName: u?.data.display_name || u?.data.username || user!.id,
        profilePicture: u?.data.icon
          ? `/api/system/assets/icons/users/${user!.id}`
          : null,
        edited: false,
        editedAt: null,
        removed: false,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
