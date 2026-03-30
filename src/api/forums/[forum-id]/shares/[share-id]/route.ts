import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";
import { getForumAccess, canModerate, deleteForumShare, createForumShare } from "@/src/lib/forum-access";

// PATCH /api/forums/forums/:forumId/shares/:shareId — update role or transfer ownership
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
    const caManager = (context as any).contextualAuthorityManager;
    const existingCA = await caManager.readRecord(shareId) as any;
    if (!existingCA) return NextResponse.json({ error: "Share not found" }, { status: 404 });

    // Ownership transfer — owner only, user-scoped shares only
    if (body.promote) {
      if (access.level !== "owner") {
        return NextResponse.json({ error: "Only the owner can transfer ownership" }, { status: 403 });
      }
      if (!existingCA.data.user) {
        return NextResponse.json({ error: "Can only promote individual users to owner" }, { status: 400 });
      }

      const newOwnerId = existingCA.data.user;
      const oldOwnerId = access.userId;

      const forums = context.recordManager<ForumRecord>("forums", "forum");
      const table = await forums.getTable();

      // Transfer ownership and update shares in a transaction-like sequence
      await forums.updateRecord(table, forumId, { ownerId: newOwnerId });

      // Remove promoted user's member CA
      await caManager.deleteContextualAuthority(shareId);

      // Create a moderator CA for the old owner
      await createForumShare(context, forumId, oldOwnerId, "moderator", newOwnerId);

      return NextResponse.json({ success: true, newOwnerId });
    }

    // Role change
    if (!body.role || !["moderator", "member", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be moderator, member, or viewer" }, { status: 400 });
    }

    await caManager.deleteContextualAuthority(shareId);

    const permMap: Record<string, string> = {
      moderator: "forums:forum-moderator",
      member: "forums:forum-member",
      viewer: "forums:forum-viewer",
    };

    let newCA: any;
    if (existingCA.data.user) {
      newCA = await caManager.createUserContextualAuthority({
        app: "forums",
        recordId: `forum-${forumId}`,
        permission: permMap[body.role],
        user: existingCA.data.user,
        createdBy: access.userId,
        context: JSON.stringify({ forumId, role: body.role }),
      });
    } else {
      newCA = await caManager.createAuthorityContextualAuthority({
        app: "forums",
        recordId: `forum-${forumId}`,
        permission: permMap[body.role],
        authority: existingCA.data.authority,
        createdBy: access.userId,
        context: JSON.stringify({ forumId, role: body.role }),
      });
    }

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
