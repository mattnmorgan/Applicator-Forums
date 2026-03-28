import { ApiContext } from "@applicator/sdk/context";
import { ForumRecord } from "@/src/types/ForumRecord";

export type AccessLevel = "owner" | "moderator" | "member" | "viewer";

export type ForumAccess = {
  level: AccessLevel;
  userId: string;
  forum: { id: string; data: ForumRecord };
};

function forumRecordId(forumId: string) {
  return `forum-${forumId}`;
}

function permissionForRole(role: "moderator" | "member" | "viewer") {
  if (role === "moderator") return "forums:forum-moderator";
  if (role === "member") return "forums:forum-member";
  return "forums:forum-viewer";
}

/**
 * Returns the current user's access level for a forum, or null if none.
 */
export async function getForumAccess(
  context: ApiContext,
  forumId: string,
): Promise<ForumAccess | null> {
  const user = await context.user();
  if (!user) return null;

  const forums = context.recordManager<ForumRecord>("forums", "forum");
  const forum = await forums.readRecord(forumId);
  if (!forum) return null;

  if (forum.data.ownerId === user.id) {
    return { level: "owner", userId: user.id, forum: forum as { id: string; data: ForumRecord } };
  }

  const caManager = (context as any).contextualAuthorityManager;
  const cas = await caManager.getContextualAuthorities("forums", forumRecordId(forumId));
  const userCA = cas.find((ca: any) => ca.data.user === user.id);

  if (userCA) {
    const ctx = userCA.data.context ? JSON.parse(userCA.data.context) : {};
    const role = ctx.role as "moderator" | "member" | "viewer";
    return { level: role, userId: user.id, forum: forum as { id: string; data: ForumRecord } };
  }

  return null;
}

/**
 * Returns true if the access level permits posting (owner, moderator, or member).
 */
export function canPost(level: AccessLevel): boolean {
  return level === "owner" || level === "moderator" || level === "member";
}

/**
 * Returns true if the access level permits moderation actions.
 */
export function canModerate(level: AccessLevel): boolean {
  return level === "owner" || level === "moderator";
}

/**
 * Creates a user-scoped contextual authority granting forum access.
 */
export async function createForumShare(
  context: ApiContext,
  forumId: string,
  userId: string,
  role: "moderator" | "member" | "viewer",
  createdBy: string,
) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.createUserContextualAuthority({
    app: "forums",
    recordId: forumRecordId(forumId),
    permission: permissionForRole(role),
    user: userId,
    createdBy,
    context: JSON.stringify({ forumId, role }),
  });
}

/**
 * Lists all contextual authorities for a forum (all user shares).
 */
export async function listForumShares(context: ApiContext, forumId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.getContextualAuthorities("forums", forumRecordId(forumId));
}

/**
 * Deletes all shares for a forum (used when deleting a forum).
 */
export async function deleteAllForumShares(context: ApiContext, forumId: string) {
  const shares = await listForumShares(context, forumId);
  const caManager = (context as any).contextualAuthorityManager;
  await Promise.all(shares.map((ca: any) => caManager.deleteContextualAuthority(ca.id)));
}

/**
 * Deletes a specific share by its CA ID.
 */
export async function deleteForumShare(context: ApiContext, shareId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.deleteContextualAuthority(shareId);
}
