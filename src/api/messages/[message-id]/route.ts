import { NextRequest, NextResponse } from "next/server";
import { ApiContext } from "@applicator/sdk/context";
import { MessageRecord } from "@/src/types/MessageRecord";
import { ThreadRecord } from "@/src/types/ThreadRecord";
import { getForumAccess, canModerate } from "@/src/lib/forum-access";

// PATCH /api/forums/messages/:messageId — edit a message
export async function PATCH(
  req: NextRequest,
  context: ApiContext,
  params: { messageId: string },
) {
  const { messageId } = params;
  const messages = context.recordManager<MessageRecord>("forums", "message");
  const message = await messages.readRecord(messageId);
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (message.data.removed) {
    return NextResponse.json({ error: "Cannot edit a removed message" }, { status: 400 });
  }

  const access = await getForumAccess(context, message.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isAuthor = message.data.authorId === user?.id;

  if (!isModerator && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if thread is locked (authors cannot edit in locked threads)
  if (!isModerator) {
    const threads = context.recordManager<ThreadRecord>("forums", "thread");
    const thread = await threads.readRecord(message.data.threadId);
    if (thread?.data.locked) {
      return NextResponse.json({ error: "Forbidden — this thread is locked" }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    if (body.content !== undefined && !body.content?.trim()) {
      return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
    }

    const table = await messages.getTable();
    const updates: Partial<MessageRecord> = {};
    if (body.content !== undefined) {
      updates.content = body.content;
      if (isAuthor) {
        updates.edited = true;
        updates.editedAt = Date.now();
      }
    }

    const updated = await messages.updateRecord(table, messageId, updates);
    return NextResponse.json({ id: updated.id, ...updated.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/forums/messages/:messageId — delete or moderate-remove a message
export async function DELETE(
  _req: NextRequest,
  context: ApiContext,
  params: { messageId: string },
) {
  const { messageId } = params;
  const messages = context.recordManager<MessageRecord>("forums", "message");
  const message = await messages.readRecord(messageId);
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getForumAccess(context, message.data.forumId);
  if (!access) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const user = await context.user();
  const isModerator = canModerate(access.level);
  const isAuthor = message.data.authorId === user?.id;

  if (!isModerator && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if thread is locked for non-moderators
  if (!isModerator) {
    const threads = context.recordManager<ThreadRecord>("forums", "thread");
    const thread = await threads.readRecord(message.data.threadId);
    if (thread?.data.locked) {
      return NextResponse.json({ error: "Forbidden — this thread is locked" }, { status: 403 });
    }
  }

  try {
    const table = await messages.getTable();

    if (isModerator && !isAuthor) {
      // Soft-delete: replace with "removed" system message
      await messages.updateRecord(table, messageId, {
        content: "",
        removed: true,
        edited: false,
        editedAt: null,
      });
    } else {
      // Hard-delete by the author
      await messages.deleteRecord(messageId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
