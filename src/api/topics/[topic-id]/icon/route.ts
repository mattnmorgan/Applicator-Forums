import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import sharp from "sharp";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// POST /api/forums/topics/:topicId/icon — upload or replace topic icon
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
  if (!canModerate(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(64, 64, { fit: "cover" })
      .png({ compressionLevel: 6 })
      .toBuffer();

    await context.appFileManager.ensureDirectory("icons/topics");
    await context.appFileManager.writeFile(`icons/topics/${topicId}.png`, resized);

    const table = await topics.getTable();
    await topics.updateRecord(table, topicId, { hasIcon: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
