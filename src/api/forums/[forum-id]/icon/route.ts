import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import sharp from "sharp";
import { ForumRecord } from "@/src/types/ForumRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// POST /api/forums/forums/:forumId/icon — upload or replace forum icon
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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(64, 64, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    await context.appFileManager.ensureDirectory("icons/forums");
    await context.appFileManager.writeFile(`icons/forums/${forumId}.jpg`, resized);

    const forums = context.recordManager<ForumRecord>("forums", "forum");
    const table = await forums.getTable();
    await forums.updateRecord(table, forumId, { hasIcon: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
