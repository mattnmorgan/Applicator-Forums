import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { getForumAccess, canModerate, deleteForumShare } from "@/src/lib/forum-access";

// PATCH /api/forums/forums/:forumId/shares/:shareId — update a share role
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { forumId: string; shareId: string },
) {
  const { forumId, shareId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body.role || !["moderator", "member", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be moderator, member, or viewer" }, { status: 400 });
    }

    // Delete the old CA and create a new one with the updated role
    const caManager = (context as any).contextualAuthorityManager;
    const existingCA = await caManager.readRecord(shareId) as any;
    if (!existingCA) return NextResponse.json({ error: "Share not found" }, { status: 404 });

    await caManager.deleteContextualAuthority(shareId);

    const permMap: Record<string, string> = {
      moderator: "forums:forum-moderator",
      member: "forums:forum-member",
      viewer: "forums:forum-viewer",
    };

    const newCA = await caManager.createUserContextualAuthority({
      app: "forums",
      recordId: `forum-${forumId}`,
      permission: permMap[body.role],
      user: existingCA.data.user,
      createdBy: access.userId,
      context: JSON.stringify({ forumId, role: body.role }),
    });

    return NextResponse.json({ id: newCA.id, role: body.role });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/forums/:forumId/shares/:shareId — remove a share
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string; shareId: string },
) {
  const { forumId, shareId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteForumShare(context, shareId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
