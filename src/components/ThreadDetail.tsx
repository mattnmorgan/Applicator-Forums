"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ButtonIcon, ButtonMenu, Icon, ProfileIndicator } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

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
  topicId: string;
  forumId: string;
  createdBy: string;
}

interface PageData {
  thread: ThreadInfo;
  topic: { id: string; name: string };
  forum: { id: string; name: string };
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
}

export default function ThreadDetail({ threadId, onBack }: Props) {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");
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
  const canReply = canPost && (!threadLocked || canModerate);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    setReplyError("");
    try {
      const res = await fetch(`/api/forums/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setReplyText("");
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
      return {
        ...prev,
        messages: prev.messages.filter((m) => m.id !== msgId),
        total: prev.total - 1,
      };
    });
  };

  const handleMessageRemoved = (msgId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === msgId ? { ...m, removed: true, content: "" } : m
        ),
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

  if (loading && !data) return <div className={styles.loading}>Loading messages…</div>;
  if (!data) return <div className={styles.loading}>Thread not found.</div>;

  const { thread, topic, forum, messages, totalPages } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </button>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span className={styles.headerTitle} style={{ fontSize: 14 }}>
            {thread.name}
            {thread.locked && (
              <span className={styles.lockedBadge} style={{ marginLeft: 8 }}>
                <Icon name="square-stop" size={10} /> Locked
              </span>
            )}
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {forum.name} › {topic.name}
          </span>
        </div>

        <div className={styles.headerActions}>
          {canModerate && (
            <ButtonIcon
              name="square-stop"
              iconSize={14}
              label={thread.locked ? "Unlock thread" : "Lock thread"}
              onClick={handleToggleLock}
              active={thread.locked}
              subvariant="warning"
              placement="bottom"
            />
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
          <div className={styles.replyEditor}>
            {replyError && (
              <div style={{ color: "#ef4444", fontSize: 12 }}>{replyError}</div>
            )}
            <textarea
              className={styles.formTextarea}
              style={{ minHeight: 60 }}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply();
              }}
            />
            <div className={styles.replyActions}>
              <button
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: replying || !replyText.trim() ? "not-allowed" : "pointer",
                  opacity: replying || !replyText.trim() ? 0.5 : 1,
                }}
                onClick={handleReply}
                disabled={replying || !replyText.trim()}
              >
                {replying ? "Posting…" : "Post Reply"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.lockedNotice}>
            <Icon name="square-stop" size={14} />
            {threadLocked ? "This thread is locked." : "You do not have permission to reply."}
          </div>
        )}
      </div>
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
  const [editText, setEditText] = useState(message.content);
  const [saving, setSaving] = useState(false);

  const isAuthor = message.authorId === currentUserId;
  const canEdit = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate);
  const canDelete = (isAuthor || canModerate) && !message.removed && (!threadLocked || canModerate);

  const menuOptions: any[] = [];
  if (canEdit) menuOptions.push({ label: "Edit", icon: "edit", onClick: () => { setEditText(message.content); setEditing(true); } });
  if (canDelete) {
    if (menuOptions.length > 0) menuOptions.push({ type: "separator" as const });
    if (canModerate && !isAuthor) {
      menuOptions.push({ label: "Remove", icon: "trash", onClick: handleRemove, variant: "danger" as const });
    } else {
      menuOptions.push({ label: "Delete", icon: "trash", onClick: handleDelete, variant: "danger" as const });
    }
  }

  async function handleSaveEdit() {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/forums/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (res.ok) {
        onUpdated({ ...message, content: editText.trim(), edited: true, editedAt: Date.now() });
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
      <div className={styles.messageLeft}>
        <ProfileIndicator
          displayName={message.authorName || "?"}
          profilePicture={message.profilePicture || undefined}
          size={36}
        />
        <div className={styles.messageAuthorName}>{message.authorName || "Unknown"}</div>
      </div>

      <div className={styles.messageRight}>
        <div className={styles.messageSubheader}>
          <span>{new Date(message.createdAt).toLocaleString()}</span>
          {message.edited && !message.removed && (
            <span style={{ color: "#475569" }}>· edited</span>
          )}
          {menuOptions.length > 0 && !editing && (
            <div className={styles.messageSubheaderActions} onClick={(e) => e.stopPropagation()}>
              <ButtonMenu
                trigger={
                  <span style={{ fontSize: 16, color: "#64748b", padding: "0 4px", cursor: "pointer" }}>⋯</span>
                }
                options={menuOptions}
                alignment="right"
              />
            </div>
          )}
        </div>

        {message.removed ? (
          <div className={styles.messageRemoved}>This message was removed by a moderator.</div>
        ) : editing ? (
          <div className={styles.messageEditingArea}>
            <textarea
              className={styles.formTextarea}
              style={{ minHeight: 80 }}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
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
                  cursor: saving || !editText.trim() ? "not-allowed" : "pointer",
                  opacity: saving || !editText.trim() ? 0.5 : 1,
                }}
                onClick={handleSaveEdit}
                disabled={saving || !editText.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.messageContent} style={{ whiteSpace: "pre-wrap" }}>
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}
