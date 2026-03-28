import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import sharp from "sharp";
import { ForumRecord } from "@/src/types/ForumRecord";
import { getForumAccess } from "@/src/lib/forum-access";

// GET /api/forums/icons/forums/:forumId — serve forum icon
export async function GET(
  _req: NextRequest,
  context: ApiContext,
  params: { forumId: string },
) {
  const { forumId } = params;
  const access = await getForumAccess(context, forumId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = `icons/forums/${forumId}.jpg`;

  try {
    const exists = await context.appFileManager.exists(filePath);

    if (!exists) {
      // Lazy migration: check for legacy iconData in the DB record
      const forums = context.recordManager<ForumRecord & { iconData?: string }>("forums", "forum");
      const forum = await forums.readRecord(forumId) as any;
      if (forum?.data.iconData) {
        const base64 = forum.data.iconData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        const resized = await sharp(buffer)
          .resize(64, 64, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();
        await context.appFileManager.ensureDirectory("icons/forums");
        await context.appFileManager.writeFile(filePath, resized);
        const table = await forums.getTable();
        await forums.updateRecord(table, forumId, { hasIcon: true, iconData: null } as any);
      } else {
        return NextResponse.json({ error: "No icon" }, { status: 404 });
      }
    }

    const buffer = await context.appFileManager.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
