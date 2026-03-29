import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";
import { SectionRecord } from "@/src/types/SectionRecord";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate, deleteAllForumShares } from "@/src/lib/forum-access";

// GET /api/forums/forums/:forumId — get forum detail with sections and topics
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });

  const sections = context.recordManager<SectionRecord>("forums", "section");
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const userMgr = context.recordManager("system", "users");

  const [sectionsResult, topicsResult] = await Promise.all([
    sections.readRecords({ fields: { forumId }, limit: 500 }),
    topics.readRecords({ fields: { forumId }, limit: 500 }),
  ]);

  const sortedSections = sectionsResult.records
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));

  // Enrich topics with lastPostUser display name and profile picture
  const enrichedTopics = await Promise.all(
    topicsResult.records.map(async (t) => {
      let lastPostUserName: string | null = null;
      let lastPostUserProfilePicture: string | null = null;
      if (t.data.lastPostUserId) {
        const u = await userMgr.readRecord(t.data.lastPostUserId) as any;
        lastPostUserName = u?.data.display_name || u?.data.username || null;
        lastPostUserProfilePicture = u?.data.icon
          ? `/api/system/assets/icons/users/${t.data.lastPostUserId}` : null;
      }
      return {
        id: t.id,
        name: t.data.name,
        description: t.data.description || "",
        hasIcon: !!t.data.hasIcon,
        sectionId: t.data.sectionId || null,
        order: t.data.order ?? 0,
        locked: !!t.data.locked,
        lastPostDate: t.data.lastPostDate || null,
        lastPostUserId: t.data.lastPostUserId || null,
        lastPostUserName,
        lastPostUserProfilePicture,
      };
    }),
  );

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
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
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
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
  if (access.level !== "owner") {
    return NextResponse.json({ error: "Forbidden — only the owner can delete a forum" }, { status: 403 });
  }

  try {
    const messages = context.recordManager("forums", "message");
    const threads = context.recordManager("forums", "thread");
    const topics = context.recordManager("forums", "topic");
    const sections = context.recordManager("forums", "section");
    const forums = context.recordManager<ForumRecord>("forums", "forum");

    await context.withTransaction(async (client) => {
      await messages.deleteFilteredRecords({ fields: { forumId } }, { client });
      await threads.deleteFilteredRecords({ fields: { forumId } }, { client });
      await topics.deleteFilteredRecords({ fields: { forumId } }, { client });
      await sections.deleteFilteredRecords({ fields: { forumId } }, { client });
      await forums.deleteRecord(forumId, { client });
    });

    // Delete shares and icon outside transaction
    await deleteAllForumShares(context, forumId);

    try {
      await context.appFileManager.deleteFile(`icons/forums/${forumId}.jpg`);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
