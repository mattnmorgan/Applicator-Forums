"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ButtonIcon, Icon, Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import NewThreadModal from "./NewThreadModal";

interface ThreadSummary {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdByProfilePicture: string | null;
  createdAt: number;
  pinned: boolean;
  locked: boolean;
  lastPostDate: number | null;
  lastPostUserName: string | null;
  lastPostUserProfilePicture: string | null;
  messageCount: number;
  lastReadAt: number | null;
}

interface TopicInfo {
  id: string;
  name: string;
  hasIcon: boolean;
  locked: boolean;
  forumId: string;
  forumName: string;
  forumHasIcon: boolean;
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
  onNavigateToForum: () => void;
}

export default function TopicDetail({ topicId, onBack, onNavigateToThread, onNavigateToForum }: Props) {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [page, setPage] = useState(1);
  const [showNewThread, setShowNewThread] = useState(false);
  const [movingThreadId, setMovingThreadId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/topics/${topicId}/threads?page=${p}`);
      const json = await res.json();
      if (json?.topic && json?.access) setData(json);
      else setAccessError(true);
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

  const handleThreadMoved = (threadId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pinned: prev.pinned.filter((t) => t.id !== threadId),
        threads: prev.threads.filter((t) => t.id !== threadId),
        total: prev.total - 1,
      };
    });
    setMovingThreadId(null);
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
  if (accessError || !data) return <div className={styles.loading}>Topic does not exist or you do not have access.</div>;

  const { topic, pinned, threads, totalPages } = data;

  return (
    <>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
        </button>

        {/* Forum icon + name — clickable */}
        <div className={styles.headerNavLink} onClick={onNavigateToForum}>
          {topic.forumHasIcon ? (
            <img src={`/api/forums/icons/forums/${topic.forumId}`} alt="" className={styles.headerIcon} />
          ) : (
            <div className={styles.headerIconPlaceholder}><Icon name="users" size={14} /></div>
          )}
          <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 500 }}>{topic.forumName}</span>
        </div>

        <span style={{ color: "#475569", margin: "0 4px", flexShrink: 0 }}>/</span>

        {/* Topic icon + name */}
        {topic.hasIcon ? (
          <img src={`/api/forums/icons/topics/${topic.id}`} alt="" className={styles.headerIcon} />
        ) : (
          <div className={styles.headerIconPlaceholder}><Icon name="list-view" size={14} /></div>
        )}

        <span className={styles.headerTitle}>
          {topic.name}
          {topic.locked && (
            <span className={styles.lockedBadge} style={{ marginLeft: 8 }}>
              <Icon name="lock" size={10} /> Locked
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
              name={topic.locked ? "unlock" : "lock"}
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
                canModerate={canModerate}
                onClick={() => onNavigateToThread(t.id)}
                onMove={() => setMovingThreadId(t.id)}
              />
            ))}
          </div>
        )}

        <div>
          {threads.length > 0 && <div className={styles.threadSectionLabelNormal}>THREADS</div>}
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
              canModerate={canModerate}
              onClick={() => onNavigateToThread(t.id)}
              onMove={() => setMovingThreadId(t.id)}
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

      {movingThreadId && (
        <MoveThreadModal
          threadId={movingThreadId}
          currentTopicId={topicId}
          forumId={topic.forumId}
          onClose={() => setMovingThreadId(null)}
          onMoved={handleThreadMoved}
        />
      )}

    </>
  );
}

function ThreadRowItem({
  thread,
  canModerate,
  onClick,
  onMove,
}: {
  thread: ThreadSummary;
  canModerate: boolean;
  onClick: () => void;
  onMove: () => void;
}) {
  const createdDate = thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : "";
  const isUnread = thread.messageCount > 0
    && (thread.lastReadAt === null || (thread.lastPostDate !== null && thread.lastPostDate > thread.lastReadAt));

  return (
    <div className={styles.threadRow} onClick={onClick}>
      {/* Main content */}
      <div className={styles.threadRowContent}>
        <div className={styles.threadRowName}>
          {isUnread && <span className={styles.unreadDot} />}
          {thread.name}
          {thread.pinned && <span style={{ color: "#3b82f6", fontSize: 12 }}><Icon name="pin" size={12} /></span>}
          {thread.locked && (
            <span className={styles.lockedBadge}><Icon name="lock" size={10} /> Locked</span>
          )}
        </div>
        {thread.description && (
          <div className={styles.threadRowDesc}>{thread.description}</div>
        )}
      </div>

      {/* Message count column */}
      <div className={styles.threadRowMsgCountCol}>
        <div className={styles.threadRowMetaLabel}>Posts</div>
        <div className={styles.threadRowMsgCount}>{thread.messageCount}</div>
      </div>

      {/* Creator column */}
      <div className={styles.threadRowCreatorCol}>
        <div className={styles.threadRowMetaLabel}>Started by</div>
        <div className={styles.threadRowMetaValue}>{thread.createdByName}</div>
        {createdDate && <div className={styles.threadRowMetaDate}>{createdDate}</div>}
      </div>

      {/* Last post column */}
      <div className={styles.threadRowLastPostCol}>
        {thread.lastPostDate ? (
          <>
            <div className={styles.threadRowMetaLabel}>Last post</div>
            {thread.lastPostUserName && (
              <div className={styles.threadRowMetaValue}>{thread.lastPostUserName}</div>
            )}
            <div className={styles.threadRowMetaDate}>{new Date(thread.lastPostDate).toLocaleDateString()}</div>
          </>
        ) : (
          <div className={styles.threadRowMetaDate} style={{ color: "#334155" }}>No replies</div>
        )}
      </div>

      {canModerate && (
        <div className={styles.threadRowActions} onClick={(e) => e.stopPropagation()}>
          <ButtonIcon
            name="move"
            iconSize={12}
            label="Move thread"
            onClick={onMove}
            placement="top"
          />
        </div>
      )}

    </div>
  );
}

function MoveThreadModal({
  threadId,
  currentTopicId,
  forumId,
  onClose,
  onMoved,
}: {
  threadId: string;
  currentTopicId: string;
  forumId: string;
  onClose: () => void;
  onMoved: (threadId: string) => void;
}) {
  const [topics, setTopics] = useState<{ id: string; name: string; sectionId: string | null }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/forums/forums/${forumId}`)
      .then((r) => r.json())
      .then((data) => {
        setSections(data.sections || []);
        setTopics((data.topics || []).filter((t: any) => t.id !== currentTopicId));
      })
      .finally(() => setLoading(false));
  }, [forumId, currentTopicId]);

  const handleMove = async () => {
    if (!selectedTopicId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/forums/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopicId }),
      });
      if (res.ok) {
        onMoved(threadId);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to move thread");
      }
    } finally {
      setSaving(false);
    }
  };

  // Group topics by section for display
  const sectionMap = new Map(sections.map((s) => [s.id, s.name]));

  return (
    <Modal
      header={<span className={styles.modalTitle}>Move Thread</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleMove} disabled={saving || !selectedTopicId}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={400}
    >
      <div style={{ padding: 16 }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {loading ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>Loading topics…</div>
        ) : topics.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>No other topics available.</div>
        ) : (
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Destination Topic</label>
            <select
              className={styles.formInput}
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
            >
              <option value="">Select a topic…</option>
              {topics.map((t) => {
                const sectionName = t.sectionId ? sectionMap.get(t.sectionId) : null;
                return (
                  <option key={t.id} value={t.id}>
                    {sectionName ? `${sectionName} / ${t.name}` : t.name}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
