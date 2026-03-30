import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import {
  getForumAccess,
  canModerate,
  getTopicAccessEntries,
  createTopicUserAccess,
  createTopicAuthorityAccess,
} from "@/src/lib/forum-access";

// GET /api/forums/topics/:topicId/access — list access entries for a restricted topic
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
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await getTopicAccessEntries(context, topicId);
  const userMgr = context.recordManager("system", "users");
  const authMgr = context.recordManager("system", "authorities");

  const enriched = await Promise.all(
    entries.map(async (ca: any) => {
      if (ca.data.user) {
        const u = await userMgr.readRecord(ca.data.user) as any;
        return {
          id: ca.id,
          type: "user",
          userId: ca.data.user,
          displayName: u?.data.display_name || u?.data.username || ca.data.user,
          username: u?.data.username || ca.data.user,
          profilePicture: u?.data.icon ? `/api/system/assets/icons/users/${ca.data.user}` : null,
        };
      } else if (ca.data.authority) {
        const auth = await authMgr.readRecord(ca.data.authority) as any;
        return {
          id: ca.id,
          type: "authority",
          authorityId: ca.data.authority,
          authorityName: auth?.data.name || ca.data.authority,
        };
      }
      return null;
    }),
  );

  return NextResponse.json({ entries: enriched.filter(Boolean) });
}

// POST /api/forums/topics/:topicId/access — add a user or authority access entry
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
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const existing = await getTopicAccessEntries(context, topicId);

    if (body.userId) {
      if (existing.some((ca: any) => ca.data.user === body.userId)) {
        return NextResponse.json({ error: "Already granted" }, { status: 409 });
      }
      const ca = await createTopicUserAccess(context, topicId, body.userId, access.userId);
      const u = await context.recordManager("system", "users").readRecord(body.userId) as any;
      return NextResponse.json({
        id: ca.id,
        type: "user",
        userId: body.userId,
        displayName: u?.data.display_name || u?.data.username || body.userId,
        username: u?.data.username || body.userId,
        profilePicture: u?.data.icon ? `/api/system/assets/icons/users/${body.userId}` : null,
      }, { status: 201 });
    } else if (body.authorityId) {
      if (existing.some((ca: any) => ca.data.authority === body.authorityId)) {
        return NextResponse.json({ error: "Already granted" }, { status: 409 });
      }
      const ca = await createTopicAuthorityAccess(context, topicId, body.authorityId, access.userId);
      const auth = await context.recordManager("system", "authorities").readRecord(body.authorityId) as any;
      return NextResponse.json({
        id: ca.id,
        type: "authority",
        authorityId: body.authorityId,
        authorityName: auth?.data.name || body.authorityId,
      }, { status: 201 });
    } else {
      return NextResponse.json({ error: "userId or authorityId is required" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
