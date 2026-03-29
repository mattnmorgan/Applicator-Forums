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
  const [page, setPage] = useState(1);
  const [replyHtml, setReplyHtml] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [editingThread, setEditingThread] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/threads/${threadId}/messages?page=${p}`);
      if (res.ok) setData(await res.json());
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
  const canEdit = (isCreator || canModerate) && !!data;
  const canDelete = (isCreator || canModerate) && !!data;

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
      return {
        ...prev,
        messages: prev.messages.map((m) => m.id === msgId ? { ...m, removed: true, content: "" } : m),
      };
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

  if (loading && !data) return <div className={styles.loading}>Loading messages…</div>;
  if (!data) return <div className={styles.loading}>Thread not found.</div>;

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

      <div className={styles.body} style={{ flex: 1, overflow: "auto" }}>
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
              onUpdated={handleMessageUpdated}
              onDeleted={handleMessageDeleted}
              onRemoved={handleMessageRemoved}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <ButtonIcon
              name="chevron-left"
              label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            />
            <span>Page {page} of {totalPages}</span>
            <ButtonIcon
              name="chevron-right"
              label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            />
          </div>
        )}

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
  onUpdated,
  onDeleted,
  onRemoved,
}: {
  message: MessageSummary;
  currentUserId: string;
  canModerate: boolean;
  threadLocked: boolean;
  onUpdated: (m: MessageSummary) => void;
  onDeleted: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editHtml, setEditHtml] = useState(message.content);
  const [saving, setSaving] = useState(false);

  const isAuthor = message.authorId === currentUserId;
  const canEdit = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate);
  const canDelete = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate);

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
