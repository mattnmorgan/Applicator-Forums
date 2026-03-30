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

function topicRecordId(topicId: string) {
  return `topic-${topicId}`;
}

function permissionForRole(role: "moderator" | "member" | "viewer") {
  if (role === "moderator") return "forums:forum-moderator";
  if (role === "member") return "forums:forum-member";
  return "forums:forum-viewer";
}

/**
 * Returns the user's main authority_id from the system users table.
 */
export async function getUserAuthorityId(context: ApiContext, userId: string): Promise<string | null> {
  const userMgr = context.recordManager("system", "users");
  const u = await userMgr.readRecord(userId) as any;
  return u?.data.authority_id || null;
}

/**
 * Returns the current user's access level for a forum, or null if none.
 * Checks user-scoped and authority-scoped contextual authorities.
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

  // Check user-scoped CA
  const userCA = cas.find((ca: any) => ca.data.user === user.id);
  if (userCA) {
    const ctx = userCA.data.context ? JSON.parse(userCA.data.context) : {};
    const role = ctx.role as "moderator" | "member" | "viewer";
    return { level: role, userId: user.id, forum: forum as { id: string; data: ForumRecord } };
  }

  // Check authority-scoped CA
  const userAuthorityId = await getUserAuthorityId(context, user.id);
  if (userAuthorityId) {
    const authorityCA = cas.find((ca: any) => ca.data.authority === userAuthorityId);
    if (authorityCA) {
      const ctx = authorityCA.data.context ? JSON.parse(authorityCA.data.context) : {};
      const role = ctx.role as "moderator" | "member" | "viewer";
      return { level: role, userId: user.id, forum: forum as { id: string; data: ForumRecord } };
    }
  }

  return null;
}

export function canPost(level: AccessLevel): boolean {
  return level === "owner" || level === "moderator" || level === "member";
}

export function canModerate(level: AccessLevel): boolean {
  return level === "owner" || level === "moderator";
}

// ── Forum shares ──────────────────────────────────────────────

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

export async function createForumAuthorityShare(
  context: ApiContext,
  forumId: string,
  authorityId: string,
  role: "moderator" | "member" | "viewer",
  createdBy: string,
) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.createAuthorityContextualAuthority({
    app: "forums",
    recordId: forumRecordId(forumId),
    permission: permissionForRole(role),
    authority: authorityId,
    createdBy,
    context: JSON.stringify({ forumId, role }),
  });
}

export async function listForumShares(context: ApiContext, forumId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.getContextualAuthorities("forums", forumRecordId(forumId));
}

export async function deleteAllForumShares(context: ApiContext, forumId: string) {
  const shares = await listForumShares(context, forumId);
  const caManager = (context as any).contextualAuthorityManager;
  await Promise.all(shares.map((ca: any) => caManager.deleteContextualAuthority(ca.id)));
}

export async function deleteForumShare(context: ApiContext, shareId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.deleteContextualAuthority(shareId);
}

// ── Topic access ──────────────────────────────────────────────

export async function getTopicAccessEntries(context: ApiContext, topicId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.getContextualAuthorities("forums", topicRecordId(topicId));
}

export async function createTopicUserAccess(
  context: ApiContext,
  topicId: string,
  userId: string,
  createdBy: string,
) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.createUserContextualAuthority({
    app: "forums",
    recordId: topicRecordId(topicId),
    permission: "forums:forum-member",
    user: userId,
    createdBy,
    context: JSON.stringify({ topicId }),
  });
}

export async function createTopicAuthorityAccess(
  context: ApiContext,
  topicId: string,
  authorityId: string,
  createdBy: string,
) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.createAuthorityContextualAuthority({
    app: "forums",
    recordId: topicRecordId(topicId),
    permission: "forums:forum-member",
    authority: authorityId,
    createdBy,
    context: JSON.stringify({ topicId }),
  });
}

export async function deleteTopicAccess(context: ApiContext, caId: string) {
  const caManager = (context as any).contextualAuthorityManager;
  return caManager.deleteContextualAuthority(caId);
}

export async function deleteAllTopicAccess(context: ApiContext, topicId: string) {
  const entries = await getTopicAccessEntries(context, topicId);
  const caManager = (context as any).contextualAuthorityManager;
  await Promise.all(entries.map((ca: any) => caManager.deleteContextualAuthority(ca.id)));
}

/**
 * Returns true if the user can access a restricted topic.
 * Moderators/owners always pass. Others need a matching user or authority CA.
 */
export async function canUserAccessTopic(
  context: ApiContext,
  topicId: string,
  userId: string,
  userAuthorityId: string | null,
  forumAccessLevel: AccessLevel,
): Promise<boolean> {
  if (canModerate(forumAccessLevel)) return true;
  const entries = await getTopicAccessEntries(context, topicId);
  if (entries.some((ca: any) => ca.data.user === userId)) return true;
  if (userAuthorityId && entries.some((ca: any) => ca.data.authority === userAuthorityId)) return true;
  return false;
}
