"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ButtonIcon, Icon, ButtonMenu } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import NewThreadModal from "./NewThreadModal";
import EditThreadModal from "./EditThreadModal";

interface ThreadSummary {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  pinned: boolean;
  locked: boolean;
  lastPostDate: number | null;
  lastPostUserName: string | null;
}

interface TopicInfo {
  id: string;
  name: string;
  hasIcon: boolean;
  locked: boolean;
  forumId: string;
  forumName: string;
}

interface PageData {
  topic: TopicInfo;
  access: string;
  currentUserId: string;
  pinned: ThreadSummary[];
  threads: ThreadSummary[];
  total: number;
  page: number;
  totalPages: number;
}

interface Props {
  topicId: string;
  onBack: () => void;
  onNavigateToThread: (threadId: string) => void;
}

export default function TopicDetail({ topicId, onBack, onNavigateToThread }: Props) {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showNewThread, setShowNewThread] = useState(false);
  const [editingThread, setEditingThread] = useState<ThreadSummary | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/topics/${topicId}/threads?page=${p}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => { load(page); }, [load, page]);

  const canModerate = data?.access === "owner" || data?.access === "moderator";
  const canPost = data?.access !== "viewer";

  const handleThreadCreated = (thread: any) => {
    setShowNewThread(false);
    onNavigateToThread(thread.id);
  };

  const handleThreadUpdated = (updated: ThreadSummary) => {
    setData((prev) => {
      if (!prev) return prev;
      const updateList = (list: ThreadSummary[]) =>
        list.map((t) => (t.id === updated.id ? { ...t, name: updated.name, description: updated.description } : t));
      return { ...prev, pinned: updateList(prev.pinned), threads: updateList(prev.threads) };
    });
    setEditingThread(null);
  };

  const handleThreadDelete = async (threadId: string) => {
    const res = await fetch(`/api/forums/threads/${threadId}`, { method: "DELETE" });
    if (res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pinned: prev.pinned.filter((t) => t.id !== threadId),
          threads: prev.threads.filter((t) => t.id !== threadId),
          total: prev.total - 1,
        };
      });
    }
  };

  const handleTogglePin = async (thread: ThreadSummary) => {
    const res = await fetch(`/api/forums/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !thread.pinned }),
    });
    if (res.ok) {
      // Reload to reflect pin/unpin change
      load(page);
    }
  };

  const handleToggleLock = async (thread: ThreadSummary) => {
    const res = await fetch(`/api/forums/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !thread.locked }),
    });
    if (res.ok) {
      setData((prev) => {
        if (!prev) return prev;
        const updateList = (list: ThreadSummary[]) =>
          list.map((t) => t.id === thread.id ? { ...t, locked: !thread.locked } : t);
        return { ...prev, pinned: updateList(prev.pinned), threads: updateList(prev.threads) };
      });
    }
  };

  const handleTopicLock = async () => {
    if (!data) return;
    const newLocked = !data.topic.locked;
    const res = await fetch(`/api/forums/topics/${topicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newLocked }),
    });
    if (res.ok) {
      setData((prev) => prev ? { ...prev, topic: { ...prev.topic, locked: newLocked } } : prev);
    }
  };

  if (loading && !data) return <div className={styles.loading}>Loading threads…</div>;
  if (!data) return <div className={styles.loading}>Topic not found.</div>;

  const { topic, pinned, threads, totalPages } = data;

  return (
    <>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </button>

        {topic.hasIcon ? (
          <img src={`/api/forums/icons/topics/${topic.id}`} alt="" className={styles.headerIcon} />
        ) : (
          <div className={styles.headerIconPlaceholder}><Icon name="list-view" size={14} /></div>
        )}

        <span className={styles.headerTitle}>
          {topic.name}
          {topic.locked && (
            <span className={styles.lockedBadge} style={{ marginLeft: 8 }}>
              <Icon name="square-stop" size={10} /> Locked
            </span>
          )}
        </span>

        <div className={styles.headerActions}>
          {canPost && !topic.locked && (
            <ButtonIcon
              name="plus"
              iconSize={14}
              label="New Thread"
              onClick={() => setShowNewThread(true)}
              placement="bottom"
            />
          )}
          {canModerate && (
            <ButtonIcon
              name={topic.locked ? "square-stop" : "square-stop"}
              iconSize={14}
              label={topic.locked ? "Unlock topic" : "Lock topic"}
              onClick={handleTopicLock}
              active={topic.locked}
              subvariant="warning"
              placement="bottom"
            />
          )}
        </div>
      </div>

      <div className={styles.body}>
        {pinned.length > 0 && (
          <div className={styles.pinnedSection}>
            <div className={styles.threadSectionLabel}>PINNED</div>
            {pinned.map((t) => (
              <ThreadRowItem
                key={t.id}
                thread={t}
                currentUserId={data.currentUserId}
                canModerate={canModerate}
                onClick={() => onNavigateToThread(t.id)}
                onEdit={() => setEditingThread(t)}
                onDelete={() => handleThreadDelete(t.id)}
                onTogglePin={() => handleTogglePin(t)}
                onToggleLock={() => handleToggleLock(t)}
              />
            ))}
          </div>
        )}

        <div>
          <div className={styles.threadSectionLabelNormal}>THREADS</div>
          {threads.length === 0 && pinned.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateTitle}>No threads yet</span>
              {canPost && !topic.locked && (
                <span className={styles.emptyStateDesc}>
                  Be the first to start a conversation.
                </span>
              )}
            </div>
          )}
          {threads.map((t) => (
            <ThreadRowItem
              key={t.id}
              thread={t}
              currentUserId={data.currentUserId}
              canModerate={canModerate}
              onClick={() => onNavigateToThread(t.id)}
              onEdit={() => setEditingThread(t)}
              onDelete={() => handleThreadDelete(t.id)}
              onTogglePin={() => handleTogglePin(t)}
              onToggleLock={() => handleToggleLock(t)}
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
      </div>

      {showNewThread && (
        <NewThreadModal
          topicId={topicId}
          onClose={() => setShowNewThread(false)}
          onCreated={handleThreadCreated}
        />
      )}

      {editingThread && (
        <EditThreadModal
          thread={editingThread}
          onClose={() => setEditingThread(null)}
          onUpdated={handleThreadUpdated}
        />
      )}
    </>
  );
}

function ThreadRowItem({
  thread,
  currentUserId,
  canModerate,
  onClick,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleLock,
}: {
  thread: ThreadSummary;
  currentUserId: string;
  canModerate: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleLock: () => void;
}) {
  const isCreator = thread.createdBy === currentUserId;
  const canEdit = canModerate || isCreator;
  const canDelete = canModerate || isCreator;

  const menuOptions: any[] = [];
  if (canEdit) menuOptions.push({ label: "Edit", icon: "edit", onClick: onEdit });
  if (canModerate) {
    menuOptions.push({ label: thread.pinned ? "Unpin" : "Pin", icon: "pin", onClick: onTogglePin });
    menuOptions.push({ label: thread.locked ? "Unlock" : "Lock", icon: "square-stop", onClick: onToggleLock });
  }
  if (menuOptions.length > 0 && canDelete) {
    menuOptions.push({ type: "separator" as const });
  }
  if (canDelete) {
    menuOptions.push({ label: "Delete", icon: "trash", onClick: onDelete, variant: "danger" as const });
  }

  return (
    <div className={styles.threadRow} onClick={onClick}>
      <div className={styles.threadRowContent}>
        <div className={styles.threadRowName}>
          {thread.name}
          {thread.pinned && <span style={{ color: "#3b82f6", fontSize: 12 }}><Icon name="pin" size={12} /></span>}
          {thread.locked && (
            <span className={styles.lockedBadge}><Icon name="square-stop" size={10} /> Locked</span>
          )}
        </div>
        {thread.description && (
          <div className={styles.threadRowDesc}>{thread.description}</div>
        )}
        <div className={styles.threadRowMeta}>
          <span>Started by {thread.createdByName} · {new Date(thread.createdAt).toLocaleDateString()}</span>
          {thread.lastPostDate && (
            <span>
              Last post {new Date(thread.lastPostDate).toLocaleDateString()}
              {thread.lastPostUserName ? ` by ${thread.lastPostUserName}` : ""}
            </span>
          )}
        </div>
      </div>
      {menuOptions.length > 0 && (
        <div className={styles.threadRowActions} onClick={(e) => e.stopPropagation()}>
          <ButtonMenu
            trigger={
              <span style={{ fontSize: 18, color: "#64748b", padding: "0 4px", cursor: "pointer" }}>⋯</span>
            }
            options={menuOptions}
            alignment="right"
          />
        </div>
      )}
    </div>
  );
}
