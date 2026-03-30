import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate, deleteTopicAccess } from "@/src/lib/forum-access";

// DELETE /api/forums/topics/:topicId/access/:accessId — remove a topic access entry
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { topicId: string; accessId: string },
) {
  const { topicId, accessId } = params;
  const topics = context.recordManager<TopicRecord>("forums", "topic");
  const topic = await topics.readRecord(topicId);
  if (!topic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, topic.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (!canModerate(access.level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await deleteTopicAccess(context, accessId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
