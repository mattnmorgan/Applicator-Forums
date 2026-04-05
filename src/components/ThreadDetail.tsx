"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ButtonIcon, Icon, ProfileIndicator, RichTextEditor, RichTextViewer } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import EditThreadModal from "./EditThreadModal";

interface MessageSummary {
  id: string;
  content: string;
  authorId: string;
  authorName: string | null;
  profilePicture: string | null;
  edited: boolean;
  editedAt: number | null;
  removed: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ThreadInfo {
  id: string;
  name: string;
  description: string;
  locked: boolean;
  pinned: boolean;
  topicId: string;
  forumId: string;
  createdBy: string;
}

interface PageData {
  thread: ThreadInfo;
  topic: { id: string; name: string; hasIcon?: boolean; locked?: boolean };
  forum: { id: string; name: string; hasIcon?: boolean };
  access: string;
  currentUserId: string;
  messages: MessageSummary[];
  total: number;
  page: number;
  totalPages: number;
}

interface Props {
  threadId: string;
  onBack: () => void;
  onNavigateToForum: () => void;
  onNavigateToTopic: () => void;
}

export default function ThreadDetail({ threadId, onBack, onNavigateToForum, onNavigateToTopic }: Props) {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [page, setPage] = useState(1);
  const [replyHtml, setReplyHtml] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [editingThread, setEditingThread] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/threads/${threadId}/messages?page=${p}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setAccessError(true);
      } else {
        setData(json);
        bodyRef.current?.scrollTo({ top: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(page); }, [load, page]);

  const canModerate = data?.access === "owner" || data?.access === "moderator";
  const canPost = data?.access !== "viewer";
  const threadLocked = !!data?.thread.locked;
  const topicLocked = !!data?.topic.locked;
  const canReply = canPost && (!threadLocked || canModerate) && (!topicLocked || canModerate);
  const isCreator = data?.thread.createdBy === data?.currentUserId;
  const canEdit = (isCreator || canModerate) && !!data && (!threadLocked || canModerate) && (!topicLocked || canModerate);
  const canDelete = (isCreator || canModerate) && !!data && (!threadLocked || canModerate) && (!topicLocked || canModerate);

  const handleReply = async () => {
    if (!replyHtml.trim()) return;
    setReplying(true);
    setReplyError("");
    try {
      const res = await fetch(`/api/forums/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyHtml }),
      });
      if (res.ok) {
        const msg = await res.json();
        setReplyHtml("");
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, messages: [...prev.messages, msg], total: prev.total + 1 };
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } else {
        const err = await res.json();
        setReplyError(err.error || "Failed to post");
      }
    } finally {
      setReplying(false);
    }
  };

  const handleMessageUpdated = (updated: MessageSummary) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, messages: prev.messages.map((m) => m.id === updated.id ? updated : m) };
    });
  };

  const handleMessageDeleted = (msgId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, messages: prev.messages.filter((m) => m.id !== msgId), total: prev.total - 1 };
    });
  };

  const handleMessageRemoved = (msgId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, messages: prev.messages.map((m) => m.id === msgId ? { ...m, removed: true, content: "" } : m) };
    });
  };

  const handleToggleLock = async () => {
    if (!data) return;
    const newLocked = !data.thread.locked;
    const res = await fetch(`/api/forums/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newLocked }),
    });
    if (res.ok) {
      setData((prev) => prev ? { ...prev, thread: { ...prev.thread, locked: newLocked } } : prev);
    }
  };

  const handleTogglePin = async () => {
    if (!data) return;
    const newPinned = !data.thread.pinned;
    const res = await fetch(`/api/forums/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: newPinned }),
    });
    if (res.ok) {
      setData((prev) => prev ? { ...prev, thread: { ...prev.thread, pinned: newPinned } } : prev);
    }
  };

  const handleThreadUpdated = (updated: { id: string; name: string; description: string }) => {
    setData((prev) => prev ? { ...prev, thread: { ...prev.thread, name: updated.name, description: updated.description } } : prev);
    setEditingThread(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/forums/threads/${threadId}`, { method: "DELETE" });
      if (res.ok) onBack();
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = async () => {
    if (!data) return;
    const { thread, topic, forum, totalPages } = data;

    // Fetch all pages (page 1 already loaded; fetch remaining in parallel)
    let allMessages: MessageSummary[] = [...data.messages];
    if (totalPages > 1) {
      const remaining = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(`/api/forums/threads/${threadId}/messages?page=${i + 2}`)
            .then((r) => r.ok ? r.json() : null)
        )
      );
      for (const page of remaining) {
        if (page?.messages) allMessages = allMessages.concat(page.messages);
      }
      allMessages.sort((a, b) => a.createdAt - b.createdAt);
    }

    const messagesHtml = allMessages.map((msg) => {
      const date = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "";
      const author = msg.removed ? "[ removed ]" : (msg.authorName || "Unknown");
      const content = msg.removed
        ? "<em style='color:#888'>This message was removed by a moderator.</em>"
        : msg.content;
      const editedNote = msg.edited && !msg.removed
        ? `<span style="color:#888;font-size:11px"> · edited</span>` : "";
      return `
        <div class="message">
          <div class="message-meta">${author} &mdash; ${date}${editedNote}</div>
          <div class="message-body">${content}</div>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${thread.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; font-size: 14px; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .breadcrumb { font-size: 12px; color: #666; margin-bottom: 6px; }
    .thread-desc { font-size: 13px; color: #444; margin-bottom: 24px; border-bottom: 1px solid #ddd; padding-bottom: 16px; }
    .message { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
    .message:last-child { border-bottom: none; }
    .message-meta { font-size: 12px; color: #555; font-family: Arial, sans-serif; margin-bottom: 6px; font-weight: 600; }
    .message-body { font-size: 14px; line-height: 1.7; }
    .message-body p { margin-bottom: 10px; }
    .message-body p:last-child { margin-bottom: 0; }
    .message-body ul, .message-body ol { padding-left: 20px; margin-bottom: 10px; }
    .message-body blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 8px 0; }
    .message-body pre, .message-body code { font-family: monospace; background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    .message-body pre { padding: 10px; overflow: auto; }
    .print-footer { margin-top: 32px; font-size: 11px; color: #999; font-family: Arial, sans-serif; text-align: right; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="breadcrumb">${forum.name} / ${topic.name}</div>
  <h1>${thread.name}</h1>
  ${thread.description ? `<div class="thread-desc">${thread.description}</div>` : ""}
  ${messagesHtml}
  <div class="print-footer">Printed ${new Date().toLocaleString()} &mdash; ${allMessages.length} post${allMessages.length !== 1 ? "s" : ""}</div>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("unload", () => URL.revokeObjectURL(url), { once: true });
    }
  };

  if (loading && !data) return <div className={styles.loading}>Loading messages…</div>;
  if (accessError || !data) return <div className={styles.loading}>Thread does not exist or you do not have access.</div>;

  const { thread, topic, forum, messages, totalPages } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
        </button>

        {/* Forum icon + name — clickable */}
        <div className={styles.headerNavLink} onClick={onNavigateToForum}>
          {forum.hasIcon ? (
            <img src={`/api/forums/icons/forums/${forum.id}`} alt="" className={styles.headerIcon} />
          ) : (
            <div className={styles.headerIconPlaceholder}><Icon name="users" size={14} /></div>
          )}
          <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>{forum.name}</span>
        </div>

        <span style={{ color: "#475569", margin: "0 4px", flexShrink: 0 }}>/</span>

        {/* Topic icon + name — clickable */}
        <div className={styles.headerNavLink} onClick={onNavigateToTopic}>
          {topic.hasIcon ? (
            <img src={`/api/forums/icons/topics/${topic.id}`} alt="" className={styles.headerIcon} />
          ) : (
            <div className={styles.headerIconPlaceholder}><Icon name="list-view" size={14} /></div>
          )}
          <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>{topic.name}</span>
        </div>

        <span style={{ color: "#475569", margin: "0 4px", flexShrink: 0 }}>/</span>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span className={styles.headerTitle} style={{ fontSize: 14 }}>
            {thread.name}
            {thread.locked && (
              <span className={styles.lockedBadge} style={{ marginLeft: 8 }}>
                <Icon name="lock" size={10} /> Locked
              </span>
            )}
          </span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <ButtonIcon
              name="chevron-left"
              label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            />
            <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{page} / {totalPages}</span>
            <ButtonIcon
              name="chevron-right"
              label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            />
          </div>
        )}

        <div className={styles.headerActions}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, color: "#ef4444", flexShrink: 0 }}>Delete?</span>
              <ButtonIcon
                name="trash"
                iconSize={14}
                label={deleting ? "Deleting…" : "Confirm delete"}
                onClick={handleDelete}
                active
                subvariant="danger"
                placement="bottom"
              />
              <ButtonIcon
                name="close"
                iconSize={14}
                label="Cancel"
                onClick={() => setConfirmDelete(false)}
                placement="bottom"
              />
            </>
          ) : (
            <>
              <ButtonIcon
                name="print"
                iconSize={14}
                label="Print / Export PDF"
                onClick={handlePrint}
                placement="bottom"
              />
              {canEdit && (
                <ButtonIcon
                  name="edit"
                  iconSize={14}
                  label="Edit thread"
                  onClick={() => setEditingThread(true)}
                  placement="bottom"
                />
              )}
              {canModerate && (
                <ButtonIcon
                  name="pin"
                  iconSize={14}
                  label={thread.pinned ? "Unpin thread" : "Pin thread"}
                  onClick={handleTogglePin}
                  active={thread.pinned}
                  placement="bottom"
                />
              )}
              {canModerate && (
                <ButtonIcon
                  name={thread.locked ? "unlock" : "lock"}
                  iconSize={14}
                  label={thread.locked ? "Unlock thread" : "Lock thread"}
                  onClick={handleToggleLock}
                  active={thread.locked}
                  subvariant="warning"
                  placement="bottom"
                />
              )}
              {canDelete && (
                <ButtonIcon
                  name="trash"
                  iconSize={14}
                  label="Delete thread"
                  onClick={() => setConfirmDelete(true)}
                  subvariant="danger"
                  placement="bottom"
                />
              )}
            </>
          )}
        </div>
      </div>

      <div ref={bodyRef} className={styles.body} style={{ flex: 1, overflow: "auto" }}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateTitle}>No messages yet</span>
            {canReply && (
              <span className={styles.emptyStateDesc}>Be the first to reply.</span>
            )}
          </div>
        )}

        <div className={styles.messageList}>
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              currentUserId={data.currentUserId}
              canModerate={canModerate}
              threadLocked={threadLocked}
              topicLocked={topicLocked}
              onUpdated={handleMessageUpdated}
              onDeleted={handleMessageDeleted}
              onRemoved={handleMessageRemoved}
            />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      <div className={styles.footer}>
        {canReply ? (
          <div className={styles.replyEditorRow}>
            <div style={{ flex: 1 }}>
              {replyError && (
                <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{replyError}</div>
              )}
              <RichTextEditor
                value={replyHtml}
                onChange={setReplyHtml}
                placeholder="Write a reply…"
                minHeight={100}
                disabled={replying}
              />
            </div>
            <div className={styles.replyPostBtn}>
              <button
                className={styles.postReplyBtn}
                onClick={handleReply}
                disabled={replying || !replyHtml.trim()}
              >
                {replying ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.lockedNotice}>
            <Icon name={threadLocked || topicLocked ? "lock" : "square-stop"} size={14} />
            {topicLocked ? "This topic is locked." : threadLocked ? "This thread is locked." : "You do not have permission to reply."}
          </div>
        )}
      </div>

      {editingThread && data && (
        <EditThreadModal
          thread={{ id: threadId, name: thread.name, description: thread.description }}
          onClose={() => setEditingThread(false)}
          onUpdated={handleThreadUpdated}
        />
      )}
    </div>
  );
}

function MessageRow({
  message,
  currentUserId,
  canModerate,
  threadLocked,
  topicLocked,
  onUpdated,
  onDeleted,
  onRemoved,
}: {
  message: MessageSummary;
  currentUserId: string;
  canModerate: boolean;
  threadLocked: boolean;
  topicLocked: boolean;
  onUpdated: (m: MessageSummary) => void;
  onDeleted: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const isAuthor = message.authorId === currentUserId;
  const canEdit = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate) && (!topicLocked || canModerate);
  const canDelete = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate) && (!topicLocked || canModerate);
  const [editing, setEditing] = useState(false);
  const [editHtml, setEditHtml] = useState(message.content);
  const [saving, setSaving] = useState(false);

  async function handleSaveEdit() {
    if (!editHtml.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/forums/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editHtml }),
      });
      if (res.ok) {
        onUpdated({ ...message, content: editHtml, edited: true, editedAt: Date.now() });
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/forums/messages/${message.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(message.id);
  }

  async function handleRemove() {
    const res = await fetch(`/api/forums/messages/${message.id}`, { method: "DELETE" });
    if (res.ok) onRemoved(message.id);
  }

  return (
    <div className={styles.messageRow}>
      <div className={styles.messageRight}>
        <div className={styles.messageSubheader}>
          {!message.removed && (
            <span style={{ cursor: "default", pointerEvents: "none" }}>
              <ProfileIndicator
                displayName={message.authorName || "?"}
                profilePicture={message.profilePicture || undefined}
                size={18}
              />
            </span>
          )}
          <span>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</span>
          {message.edited && !message.removed && (
            <span style={{ color: "#475569" }}>· edited</span>
          )}
          {(canEdit || canDelete) && !editing && (
            <div className={styles.messageSubheaderActions} onClick={(e) => e.stopPropagation()}>
              {canEdit && (
                <ButtonIcon
                  name="edit"
                  iconSize={12}
                  label="Edit post"
                  onClick={() => { setEditHtml(message.content); setEditing(true); }}
                  placement="top"
                />
              )}
              {canDelete && (
                <ButtonIcon
                  name="trash"
                  iconSize={12}
                  label={canModerate && !isAuthor ? "Remove post" : "Delete post"}
                  onClick={canModerate && !isAuthor ? handleRemove : handleDelete}
                  subvariant="danger"
                  placement="top"
                />
              )}
            </div>
          )}
        </div>

        {message.removed ? (
          <div className={styles.messageRemoved}>This message was removed by a moderator.</div>
        ) : editing ? (
          <div className={styles.messageEditingArea}>
            <RichTextEditor
              value={editHtml}
              onChange={setEditHtml}
              minHeight={80}
              disabled={saving}
            />
            <div className={styles.messageEditActions}>
              <button
                style={{
                  background: "none",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving || !editHtml.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !editHtml.trim() ? 0.5 : 1,
                }}
                onClick={handleSaveEdit}
                disabled={saving || !editHtml.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.messageContent}>
            <RichTextViewer
              html={message.content}
              style={{ fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
