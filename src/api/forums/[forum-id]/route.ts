import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";
import { SectionRecord } from "@/src/types/SectionRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { TopicAccessRecord } from "@/src/types/TopicAccessRecord";
import {
  getForumAccess,
  canModerate,
  deleteAllForumShares,
  getUserAuthorityId,
  canUserAccessTopic,
} from "@/src/lib/forum-access";

// GET /api/forums/forums/:forumId — get forum detail with sections and topics
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const forumsRm = context.recordManager<ForumRecord>("forums", "forum");
  if (!await forumsRm.readRecord(forumId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sections = context.recordManager<SectionRecord>("forums", "section");
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const userMgr = context.recordManager("system", "users");

  const topicAccessRm = context.recordManager<TopicAccessRecord>("forums", "topic_access");

  const [sectionsResult, topicsResult, topicAccessResult] = await Promise.all([
    sections.readRecords({ fields: { forumId }, limit: 500 }),
    topics.readRecords({ fields: { forumId }, limit: 500 }),
    topicAccessRm.readRecords({
      filters: [
        { field: "userId", operator: "=", value: access.userId },
        { field: "forumId", operator: "=", value: forumId },
      ],
      limit: 500,
    }),
  ]);

  // Build map: topicId -> accessedAt (when the user last visited this topic's thread list)
  const topicAccessMap = new Map<string, number>();
  for (const a of topicAccessResult.records) {
    topicAccessMap.set(a.data.topicId, a.data.accessedAt);
  }

  const userAuthorityId = canModerate(access.level)
    ? null
    : await getUserAuthorityId(context, access.userId);

  const sortedSections = sectionsResult.records
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));

  // Enrich topics with lastPostUser info; filter restricted topics the user can't access
  const enrichedTopics = (
    await Promise.all(
      topicsResult.records.map(async (t) => {
        // Filter restricted topics
        if (t.data.restricted) {
          const allowed = await canUserAccessTopic(
            context,
            t.id,
            access.userId,
            userAuthorityId,
            access.level,
          );
          if (!allowed) return null;
        }

        let lastPostUserName: string | null = null;
        let lastPostUserProfilePicture: string | null = null;
        if (t.data.lastPostUserId) {
          const u = await userMgr.readRecord(t.data.lastPostUserId) as any;
          lastPostUserName = u?.data.display_name || u?.data.username || null;
          lastPostUserProfilePicture = u?.data.icon
            ? `/api/system/assets/icons/users/${t.data.lastPostUserId}` : null;
        }

        const topicAccessedAt = topicAccessMap.get(t.id) ?? null;
        const hasUnread = t.data.lastPostDate !== null
          && (topicAccessedAt === null || t.data.lastPostDate > topicAccessedAt);

        return {
          id: t.id,
          name: t.data.name,
          description: t.data.description || "",
          hasIcon: !!t.data.hasIcon,
          sectionId: t.data.sectionId || null,
          order: t.data.order ?? 0,
          locked: !!t.data.locked,
          restricted: !!t.data.restricted,
          lastPostDate: t.data.lastPostDate || null,
          lastPostUserId: t.data.lastPostUserId || null,
          lastPostUserName,
          lastPostUserProfilePicture,
          hasUnread,
        };
      }),
    )
  ).filter(Boolean) as NonNullable<(typeof enrichedTopics)[number]>[];

  const sortedTopics = enrichedTopics.sort((a, b) => a.order - b.order);

  return NextResponse.json({
    id: access.forum.id,
    name: access.forum.data.name,
    description: access.forum.data.description || "",
    ownerId: access.forum.data.ownerId,
    hasIcon: !!access.forum.data.hasIcon,
    access: access.level,
    currentUserId: access.userId,
    sections: sortedSections.map((s) => ({
      id: s.id,
      name: s.data.name,
      order: s.data.order,
    })),
    topics: sortedTopics,
  });
}

// PATCH /api/forums/forums/:forumId — update name/description
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const forumsRm = context.recordManager<ForumRecord>("forums", "forum");
  if (!await forumsRm.readRecord(forumId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updates: Partial<ForumRecord> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();

    const forums = context.recordManager<ForumRecord>("forums", "forum");
    const table = await forums.getTable();
    const updated = await forums.updateRecord(table, forumId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/forums/:forumId — delete a forum (owner only)
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const forumsRm = context.recordManager<ForumRecord>("forums", "forum");
  if (!await forumsRm.readRecord(forumId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access.level !== "owner") {
    return NextResponse.json({ error: "Forbidden — only the owner can delete a forum" }, { status: 403 });
  }

  try {
    const messages = context.recordManager("forums", "message");
    const threads = context.recordManager("forums", "thread");
    const topics = context.recordManager("forums", "topic");
    const sections = context.recordManager("forums", "section");
    const forums = context.recordManager<ForumRecord>("forums", "forum");
    const threadAccess = context.recordManager("forums", "thread_access");
    const topicAccess = context.recordManager("forums", "topic_access");

    await context.withTransaction(async (client) => {
      await messages.deleteFilteredRecords({ fields: { forumId } }, { client });
      await threadAccess.deleteFilteredRecords({ fields: { forumId } }, { client });
      await topicAccess.deleteFilteredRecords({ fields: { forumId } }, { client });
      await threads.deleteFilteredRecords({ fields: { forumId } }, { client });
      await topics.deleteFilteredRecords({ fields: { forumId } }, { client });
      await sections.deleteFilteredRecords({ fields: { forumId } }, { client });
      await forums.deleteRecord(forumId, { client });
    });

    await deleteAllForumShares(context, forumId);

    try {
      await context.appFileManager.deleteFile(`icons/forums/${forumId}.jpg`);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
