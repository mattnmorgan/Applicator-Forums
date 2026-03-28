import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";

// GET /api/forums/forums — list forums owned by or shared with the current user
export async function GET(_req: NextRequest, context: ApiContext) {
  const user = await context.user();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const forums = context.recordManager<ForumRecord>("forums", "forum");

  const ownedResult = await forums.readRecords({ fields: { ownerId: user.id }, limit: 500 });

  // Discover forums shared with this user via contextual authorities
  const caManager = (context as any).contextualAuthorityManager;
  const userCAsResult = await caManager.readRecords({
    fields: { user: user.id, app: "forums" },
  });
  const userCAs = userCAsResult.records;

  const sharedForums: Array<{
    id: string;
    name: string;
    description: string;
    ownerId: string;
    ownerName: string;
    hasIcon: boolean;
    role: string;
    shareId: string;
  }> = [];

  const userMgr = context.recordManager("system", "users");

  for (const ca of userCAs) {
    const ctx = ca.data.context ? JSON.parse(ca.data.context) : {};
    // CA id format: "forums:forum-{forumId}:user:{userId}"
    const idMatch = ca.id.match(/^forums:forum-(.+):user:/);
    const forumId = idMatch?.[1];
    if (!forumId) continue;

    const forum = await forums.readRecord(forumId);
    if (!forum) continue;

    const ownerRec = await userMgr.readRecord(forum.data.ownerId) as any;
    sharedForums.push({
      id: forum.id,
      name: forum.data.name,
      description: forum.data.description || "",
      ownerId: forum.data.ownerId,
      ownerName: ownerRec?.data.display_name || ownerRec?.data.username || forum.data.ownerId,
      hasIcon: !!forum.data.hasIcon,
      role: ctx.role || "viewer",
      shareId: ca.id,
    });
  }

  const ownerDisplayName = (user as any).display_name || (user as any).displayName || (user as any).username || user.id;

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
