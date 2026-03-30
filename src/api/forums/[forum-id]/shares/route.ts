import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import {
  getForumAccess,
  canModerate,
  createForumShare,
  createForumAuthorityShare,
  listForumShares,
} from "@/src/lib/forum-access";

// GET /api/forums/forums/:forumId/shares — list all shares (users + authorities)
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found or access denied" }, { status: 404 });
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cas = await listForumShares(context, forumId);
  const userMgr = context.recordManager("system", "users");
  const authMgr = context.recordManager("system", "authorities");

  const enriched = await Promise.all(
    cas.map(async (ca: any) => {
      const ctx = ca.data.context ? JSON.parse(ca.data.context) : {};
      if (ca.data.user) {
        const u = await userMgr.readRecord(ca.data.user) as any;
        return {
          id: ca.id,
          type: "user" as const,
          userId: ca.data.user,
          displayName: u?.data.display_name || u?.data.username || ca.data.user,
          username: u?.data.username || ca.data.user,
          profilePicture: u?.data.icon ? `/api/system/assets/icons/users/${ca.data.user}` : null,
          role: (ctx.role || "viewer") as "moderator" | "member" | "viewer",
        };
      } else if (ca.data.authority) {
        const auth = await authMgr.readRecord(ca.data.authority) as any;
        return {
          id: ca.id,
          type: "authority" as const,
          authorityId: ca.data.authority,
          authorityName: auth?.data.name || ca.data.authority,
          role: (ctx.role || "viewer") as "moderator" | "member" | "viewer",
        };
      }
      return null;
    }),
  );

  return NextResponse.json({ shares: enriched.filter(Boolean) });
}

// POST /api/forums/forums/:forumId/shares — share with a user or authority
export async function POST(
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
    if (!body.role || !["moderator", "member", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be moderator, member, or viewer" }, { status: 400 });
    }

    const existing = await listForumShares(context, forumId);

    // Authority grant
    if (body.authorityId) {
      if (existing.find((ca: any) => ca.data.authority === body.authorityId)) {
        return NextResponse.json({ error: "Already shared with this authority" }, { status: 409 });
      }
      const ca = await createForumAuthorityShare(context, forumId, body.authorityId, body.role, access.userId);
      const authMgr = context.recordManager("system", "authorities");
      const auth = await authMgr.readRecord(body.authorityId) as any;
      return NextResponse.json(
        {
          id: ca.id,
          type: "authority",
          authorityId: body.authorityId,
          authorityName: auth?.data.name || body.authorityId,
          role: body.role,
        },
        { status: 201 },
      );
    }

    // User grant
    if (!body.userId) {
      return NextResponse.json({ error: "userId or authorityId is required" }, { status: 400 });
    }
    if (body.userId === access.userId) {
      return NextResponse.json({ error: "Cannot share with yourself" }, { status: 400 });
    }
    if (body.userId === access.forum.data.ownerId) {
      return NextResponse.json({ error: "Cannot share with the forum owner" }, { status: 400 });
    }
    if (existing.find((ca: any) => ca.data.user === body.userId)) {
      return NextResponse.json({ error: "Already shared with this user" }, { status: 409 });
    }

    const ca = await createForumShare(context, forumId, body.userId, body.role, access.userId);
    const userMgr = context.recordManager("system", "users");
    const u = await userMgr.readRecord(body.userId) as any;
    return NextResponse.json(
      {
        id: ca.id,
        type: "user",
        userId: body.userId,
        displayName: u?.data.display_name || u?.data.username || body.userId,
        username: u?.data.username || body.userId,
        profilePicture: u?.data.icon ? `/api/system/assets/icons/users/${body.userId}` : null,
        role: body.role,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
