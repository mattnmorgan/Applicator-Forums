import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import sharp from "sharp";
import { TopicRecord } from "@/src/types/TopicRecord";
import { getForumAccess } from "@/src/lib/forum-access";

// GET /api/forums/icons/topics/:topicId — serve topic icon
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
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = `icons/topics/${topicId}.png`;
  const legacyPath = `icons/topics/${topicId}.jpg`;

  try {
    if (await context.appFileManager.exists(filePath)) {
      const buffer = await context.appFileManager.readFile(filePath);
      return new NextResponse(buffer, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
      });
    }

    if (await context.appFileManager.exists(legacyPath)) {
      const buffer = await context.appFileManager.readFile(legacyPath);
      return new NextResponse(buffer, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    // Lazy migration: convert legacy iconData in DB record
    const topicWithLegacy = topic as any;
    if (topicWithLegacy.data.iconData) {
      const base64 = topicWithLegacy.data.iconData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const resized = await sharp(buffer)
        .resize(64, 64, { fit: "cover" })
        .png({ compressionLevel: 6 })
        .toBuffer();
      await context.appFileManager.ensureDirectory("icons/topics");
      await context.appFileManager.writeFile(filePath, resized);
      const table = await topics.getTable();
      await topics.updateRecord(table, topicId, { hasIcon: true, iconData: null } as any);
      return new NextResponse(resized, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
      });
    }

    return NextResponse.json({ error: "No icon" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
