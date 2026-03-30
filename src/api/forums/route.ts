import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";
import { getUserAuthorityId } from "@/src/lib/forum-access";

// GET /api/forums/forums — list forums owned by or shared with the current user
export async function GET(_req: NextRequest, context: ApiContext) {
  const user = await context.user();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forums = context.recordManager<ForumRecord>("forums", "forum");
  const caManager = (context as any).contextualAuthorityManager;
  const userMgr = context.recordManager("system", "users");

  const ownedResult = await forums.readRecords({ fields: { ownerId: user.id }, limit: 500 });

  // Collect user-scoped and authority-scoped shared forums
  const userCAsResult = await caManager.readRecords({
    fields: { user: user.id, app: "forums" },
  });

  const userAuthorityId = await getUserAuthorityId(context, user.id);
  const authCAsResult = userAuthorityId
    ? await caManager.readRecords({ fields: { authority: userAuthorityId, app: "forums" } })
    : { records: [] };

  // Deduplicate by forumId — user-scoped takes priority over authority-scoped
  const seenForumIds = new Set<string>();
  const allCAs = [...userCAsResult.records, ...authCAsResult.records];

  const sharedForums: Array<{
    id: string;
    name: string;
    description: string;
    ownerId: string;
    ownerName: string;
    ownerProfilePicture: string | null;
    hasIcon: boolean;
    role: string;
    shareId: string;
  }> = [];

  for (const ca of allCAs) {
    const ctx = ca.data.context ? JSON.parse(ca.data.context) : {};
    const forumId = ctx.forumId;
    if (!forumId || seenForumIds.has(forumId)) continue;

    const forum = await forums.readRecord(forumId);
    if (!forum || forum.data.ownerId === user.id) continue;

    seenForumIds.add(forumId);
    const ownerRec = await userMgr.readRecord(forum.data.ownerId) as any;
    sharedForums.push({
      id: forum.id,
      name: forum.data.name,
      description: forum.data.description || "",
      ownerId: forum.data.ownerId,
      ownerName: ownerRec?.data.display_name || ownerRec?.data.username || forum.data.ownerId,
      ownerProfilePicture: ownerRec?.data.icon
        ? `/api/system/assets/icons/users/${forum.data.ownerId}` : null,
      hasIcon: !!forum.data.hasIcon,
      role: ctx.role || "viewer",
      shareId: ca.id,
    });
  }

  const ownerDisplayName = (user as any).display_name || (user as any).displayName || (user as any).username || user.id;
  const canCreate = await context.isUserAuthorizedFor("forums:create-forum");

  return NextResponse.json({
    owned: ownedResult.records.map((r) => ({
      id: r.id,
      name: r.data.name,
      description: r.data.description || "",
      ownerId: r.data.ownerId,
      ownerName: ownerDisplayName,
      hasIcon: !!r.data.hasIcon,
      role: "owner",
    })),
    shared: sharedForums,
    canCreate,
  });
}

// POST /api/forums/forums — create a new forum
export async function POST(req: NextRequest, context: ApiContext) {
  const user = await context.user();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const forums = context.recordManager<ForumRecord>("forums", "forum");
    const table = await forums.getTable();
    const record = await forums.createRecord(table, {
      name: body.name.trim(),
      description: body.description?.trim() || "",
      ownerId: user.id,
      hasIcon: false,
    });

    return NextResponse.json({ id: record.id, ...record.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
