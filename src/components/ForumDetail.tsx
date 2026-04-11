"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ButtonIcon, Icon, Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import TopicEditModal from "./TopicEditModal";

interface TopicSummary {
  id: string;
  name: string;
  description: string;
  hasIcon: boolean;
  sectionId: string | null;
  order: number;
  locked: boolean;
  restricted: boolean;
  lastPostDate: number | null;
  lastPostUserName: string | null;
  lastPostUserProfilePicture: string | null;
  hasUnread: boolean;
}

interface SectionSummary {
  id: string;
  name: string;
  order: number;
}

interface ForumData {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  hasIcon: boolean;
  access: string;
  currentUserId: string;
  sections: SectionSummary[];
  topics: TopicSummary[];
}

interface Props {
  forumId: string;
  onBack: () => void;
  onNavigateToTopic: (topicId: string) => void;
  onNavigateToSettings: () => void;
}

export default function ForumDetail({ forumId, onBack, onNavigateToTopic, onNavigateToSettings }: Props) {
  const [forum, setForum] = useState<ForumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [movingTopicId, setMovingTopicId] = useState<string | null>(null);

  // Drag state for sections
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);

  // Drag state for topics
  const [draggingTopicId, setDraggingTopicId] = useState<string | null>(null);
  const [dragOverTopicId, setDragOverTopicId] = useState<string | null>(null);
  const [dragOverSectionDropId, setDragOverSectionDropId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forums/forums/${forumId}`);
      const json = await res.json().catch(() => null);
      if (json?.id && json?.access) setForum(json);
      else setAccessError(true);
    } finally {
      setLoading(false);
    }
  }, [forumId]);

  useEffect(() => { load(); }, [load]);

  const canModerate = forum?.access === "owner" || forum?.access === "moderator";

  // ── Section handlers ────────────────────────────────────
  const handleAddSection = async () => {
    const res = await fetch(`/api/forums/forums/${forumId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Section" }),
    });
    if (res.ok) {
      const data = await res.json();
      setForum((prev) => prev ? { ...prev, sections: [...prev.sections, { id: data.id, name: data.name, order: data.order }].sort((a, b) => a.order - b.order) } : prev);
    }
  };

  const handleSectionNameSave = async (sectionId: string, name: string) => {
    if (!name.trim()) return;
    const res = await fetch(`/api/forums/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      setForum((prev) => prev ? { ...prev, sections: prev.sections.map((s) => s.id === sectionId ? { ...s, name: name.trim() } : s) } : prev);
    }
    setEditingSectionId(null);
  };

  const handleDeleteSection = async (sectionId: string) => {
    const res = await fetch(`/api/forums/sections/${sectionId}`, { method: "DELETE" });
    if (res.ok) {
      setForum((prev) => {
        if (!prev) return prev;
        const updatedTopics = prev.topics.map((t) =>
          t.sectionId === sectionId ? { ...t, sectionId: null } : t,
        );
        return { ...prev, sections: prev.sections.filter((s) => s.id !== sectionId), topics: updatedTopics };
      });
    }
  };

  // ── Topic handlers ──────────────────────────────────────
  const handleAddTopic = async (sectionId: string | null) => {
    const res = await fetch(`/api/forums/forums/${forumId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Topic", sectionId }),
    });
    if (res.ok) {
      const data = await res.json();
      const newTopic: TopicSummary = {
        id: data.id,
        name: data.name,
        description: data.description || "",
        hasIcon: false,
        sectionId: data.sectionId || null,
        order: data.order ?? 0,
        locked: false,
        restricted: false,
        lastPostDate: null,
        lastPostUserName: null,
        lastPostUserProfilePicture: null,
        hasUnread: false,
      };
      setForum((prev) => prev ? { ...prev, topics: [...prev.topics, newTopic] } : prev);
    }
  };

  const handleTopicUpdated = (updated: TopicSummary) => {
    setForum((prev) => prev ? { ...prev, topics: prev.topics.map((t) => t.id === updated.id ? updated : t) } : prev);
    setEditingTopicId(null);
  };

  const handleTopicMoved = (topicId: string, newSectionId: string | null) => {
    setForum((prev) => {
      if (!prev) return prev;
      return { ...prev, topics: prev.topics.map((t) => t.id === topicId ? { ...t, sectionId: newSectionId } : t) };
    });
    setMovingTopicId(null);
  };

  const handleDeleteTopic = async (topicId: string) => {
    const res = await fetch(`/api/forums/topics/${topicId}`, { method: "DELETE" });
    if (res.ok) {
      setForum((prev) => prev ? { ...prev, topics: prev.topics.filter((t) => t.id !== topicId) } : prev);
    }
  };

  // ── Section DnD ─────────────────────────────────────────
  const handleSectionDragStart = (e: React.DragEvent, sectionId: string) => {
    e.stopPropagation();
    setDraggingSectionId(sectionId);
    e.dataTransfer.setData("dragType", "section");
  };

  const handleSectionDragOver = (e: React.DragEvent, sectionId: string) => {
    if (draggingSectionId) {
      e.preventDefault();
      setDragOverSectionId(sectionId);
    }
  };

  const handleSectionDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingSectionId || draggingSectionId === targetId || !forum) {
      setDraggingSectionId(null); setDragOverSectionId(null); return;
    }
    const sorted = [...forum.sections].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((s) => s.id === draggingSectionId);
    const toIdx = sorted.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingSectionId(null); setDragOverSectionId(null); return; }
    const newList = [...sorted];
    const [moved] = newList.splice(fromIdx, 1);
    newList.splice(toIdx, 0, moved);
    const updated = newList.map((s, i) => ({ ...s, order: i }));
    setForum((prev) => prev ? { ...prev, sections: updated } : prev);
    setDraggingSectionId(null); setDragOverSectionId(null);
    try {
      await fetch(`/api/forums/forums/${forumId}/sections/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: updated.map((s) => ({ id: s.id, order: s.order })) }),
      });
    } catch {}
  };

  // ── Topic DnD ───────────────────────────────────────────
  const handleTopicDragStart = (e: React.DragEvent, topicId: string) => {
    e.stopPropagation();
    setDraggingTopicId(topicId);
    e.dataTransfer.setData("dragType", "topic");
  };

  const handleTopicDragOver = (e: React.DragEvent, topicId: string) => {
    e.preventDefault();
    setDragOverTopicId(topicId);
    setDragOverSectionDropId(null);
  };

  const handleTopicDrop = async (e: React.DragEvent, targetTopicId: string, targetSectionId: string | null) => {
    e.preventDefault();
    if (!draggingTopicId || draggingTopicId === targetTopicId || !forum) {
      setDraggingTopicId(null); setDragOverTopicId(null); return;
    }
    await moveTopicToSection(draggingTopicId, targetSectionId, targetTopicId);
  };

  // Drop on a section drop zone (for empty sections or end-of-section)
  const handleSectionDropZoneDragOver = (e: React.DragEvent, sectionId: string | null) => {
    if (draggingTopicId) {
      e.preventDefault();
      e.stopPropagation();
      setDragOverSectionDropId(sectionId ?? "__unsectioned__");
      setDragOverTopicId(null);
    }
  };

  const handleSectionDropZoneDrop = async (e: React.DragEvent, sectionId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingTopicId || !forum) {
      setDraggingTopicId(null); setDragOverSectionDropId(null); return;
    }
    await moveTopicToSection(draggingTopicId, sectionId, null);
  };

  const moveTopicToSection = async (topicId: string, newSectionId: string | null, beforeTopicId: string | null) => {
    if (!forum) return;
    const draggingTopic = forum.topics.find((t) => t.id === topicId);
    if (!draggingTopic) { setDraggingTopicId(null); setDragOverTopicId(null); setDragOverSectionDropId(null); return; }

    const sectionTopics = forum.topics
      .filter((t) => t.sectionId === newSectionId && t.id !== topicId)
      .sort((a, b) => a.order - b.order);

    const insertIdx = beforeTopicId
      ? sectionTopics.findIndex((t) => t.id === beforeTopicId)
      : sectionTopics.length;

    const withInserted = [...sectionTopics];
    withInserted.splice(insertIdx === -1 ? withInserted.length : insertIdx, 0, { ...draggingTopic, sectionId: newSectionId });
    const reordered = withInserted.map((t, i) => ({ ...t, order: i }));

    setForum((prev) => {
      if (!prev) return prev;
      const otherTopics = prev.topics.filter((t) => t.id !== topicId && t.sectionId !== newSectionId);
      return { ...prev, topics: [...otherTopics, ...reordered] };
    });
    setDraggingTopicId(null); setDragOverTopicId(null); setDragOverSectionDropId(null);

    try {
      await fetch(`/api/forums/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: newSectionId, order: reordered.find((t) => t.id === topicId)?.order ?? 0 }),
      });
    } catch {}
  };

  if (loading) return <div className={styles.loading}>Loading forum…</div>;
  if (accessError || !forum) return <div className={styles.loading}>Forum does not exist or you do not have access.</div>;

  const sortedSections = [...forum.sections].sort((a, b) => a.order - b.order);
  const editingTopic = editingTopicId ? forum.topics.find((t) => t.id === editingTopicId) : null;

  return (
    <>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
        </button>

        {forum.hasIcon ? (
          <img src={`/api/forums/icons/forums/${forum.id}`} alt="" className={styles.headerIcon} />
        ) : (
          <div className={styles.headerIconPlaceholder}><Icon name="users" size={14} /></div>
        )}

        <span className={styles.headerTitle}>{forum.name}</span>

        <div className={styles.headerActions}>
          {canModerate && (
            <ButtonIcon
              name="edit"
              iconSize={14}
              label={editMode ? "Exit edit mode" : "Edit forum"}
              onClick={() => setEditMode((v) => !v)}
              active={editMode}
              subvariant="info"
              placement="bottom"
            />
          )}
          {forum.access === "owner" && (
            <ButtonIcon
              name="settings"
              iconSize={14}
              label="Forum settings"
              onClick={onNavigateToSettings}
              placement="bottom"
            />
          )}
        </div>
      </div>

      {editMode && (
        <div className={styles.editModeBar}>
          <Icon name="edit" size={12} />
          Edit mode — drag to reorder, click section names to rename
        </div>
      )}

      {/* Body */}
      <div className={styles.body}>
        {sortedSections.map((section) => {
          const sectionTopics = forum.topics
            .filter((t) => t.sectionId === section.id)
            .sort((a, b) => a.order - b.order);

          // In non-edit mode, hide empty sections
          if (!editMode && sectionTopics.length === 0) return null;

          return (
            <div
              key={section.id}
              className={`${styles.sectionGroup} ${editMode && dragOverSectionId === section.id ? styles.sectionDragOver : ""}`}
              draggable={editMode && !draggingTopicId}
              onDragStart={editMode ? (e) => handleSectionDragStart(e, section.id) : undefined}
              onDragOver={editMode ? (e) => handleSectionDragOver(e, section.id) : undefined}
              onDrop={editMode ? (e) => handleSectionDrop(e, section.id) : undefined}
              onDragEnd={() => { setDraggingSectionId(null); setDragOverSectionId(null); }}
            >
              <div className={styles.sectionGroupHeader}>
                {editMode && <span className={styles.dragHandle}><Icon name="drag" size={14} /></span>}

                {editMode && editingSectionId === section.id ? (
                  <input
                    className={styles.sectionNameInput}
                    value={editingSectionName}
                    onChange={(e) => setEditingSectionName(e.target.value)}
                    onBlur={() => handleSectionNameSave(section.id, editingSectionName)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSectionNameSave(section.id, editingSectionName);
                      if (e.key === "Escape") setEditingSectionId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span
                    className={styles.sectionGroupTitle}
                    onClick={editMode ? () => { setEditingSectionId(section.id); setEditingSectionName(section.name); } : undefined}
                    style={editMode ? { cursor: "text" } : undefined}
                  >
                    {section.name}
                  </span>
                )}

                {editMode && (
                  <ButtonIcon
                    name="trash"
                    iconSize={12}
                    label="Delete section"
                    onClick={() => handleDeleteSection(section.id)}
                    subvariant="danger"
                    size="sm"
                    placement="bottom"
                  />
                )}
              </div>

              {sectionTopics.map((topic) => (
                <TopicRowItem
                  key={topic.id}
                  topic={topic}
                  editMode={editMode}
                  canModerate={canModerate}
                  isDragging={draggingTopicId === topic.id}
                  isDragOver={dragOverTopicId === topic.id}
                  onClick={() => !editMode && onNavigateToTopic(topic.id)}
                  onDragStart={(e) => handleTopicDragStart(e, topic.id)}
                  onDragOver={(e) => handleTopicDragOver(e, topic.id)}
                  onDrop={(e) => handleTopicDrop(e, topic.id, topic.sectionId)}
                  onDragEnd={() => { setDraggingTopicId(null); setDragOverTopicId(null); setDragOverSectionDropId(null); }}
                  onEdit={() => setEditingTopicId(topic.id)}
                  onDelete={() => handleDeleteTopic(topic.id)}
                  onMove={() => setMovingTopicId(topic.id)}
                />
              ))}

              {/* Drop zone for empty section or end of section when dragging a topic */}
              {editMode && draggingTopicId && (
                <div
                  className={styles.sectionTopicDropZone}
                  style={{
                    background: dragOverSectionDropId === section.id ? "rgba(59,130,246,0.1)" : undefined,
                    borderColor: dragOverSectionDropId === section.id ? "#3b82f6" : undefined,
                  }}
                  onDragOver={(e) => handleSectionDropZoneDragOver(e, section.id)}
                  onDrop={(e) => handleSectionDropZoneDrop(e, section.id)}
                >
                  {sectionTopics.length === 0 ? "Drop topic here" : ""}
                </div>
              )}

              {editMode && (
                <button className={styles.addTopicBtn} onClick={() => handleAddTopic(section.id)}>
                  <Icon name="plus" size={12} /> Add Topic
                </button>
              )}
            </div>
          );
        })}

        {/* Unsectioned topics */}
        {(() => {
          const unsectioned = forum.topics
            .filter((t) => !t.sectionId)
            .sort((a, b) => a.order - b.order);

          if (unsectioned.length === 0 && !editMode) return null;

          return (
            <div className={styles.sectionGroup}>
              {forum.sections.length > 0 && (
                <div className={styles.sectionGroupHeader}>
                  <span className={styles.sectionGroupTitle} style={{ color: "#475569" }}>
                    Other
                  </span>
                </div>
              )}
              {unsectioned.map((topic) => (
                <TopicRowItem
                  key={topic.id}
                  topic={topic}
                  editMode={editMode}
                  canModerate={canModerate}
                  isDragging={draggingTopicId === topic.id}
                  isDragOver={dragOverTopicId === topic.id}
                  onClick={() => !editMode && onNavigateToTopic(topic.id)}
                  onDragStart={(e) => handleTopicDragStart(e, topic.id)}
                  onDragOver={(e) => handleTopicDragOver(e, topic.id)}
                  onDrop={(e) => handleTopicDrop(e, topic.id, null)}
                  onDragEnd={() => { setDraggingTopicId(null); setDragOverTopicId(null); setDragOverSectionDropId(null); }}
                  onEdit={() => setEditingTopicId(topic.id)}
                  onDelete={() => handleDeleteTopic(topic.id)}
                  onMove={() => setMovingTopicId(topic.id)}
                />
              ))}

              {editMode && draggingTopicId && (
                <div
                  className={styles.sectionTopicDropZone}
                  style={{
                    background: dragOverSectionDropId === "__unsectioned__" ? "rgba(59,130,246,0.1)" : undefined,
                    borderColor: dragOverSectionDropId === "__unsectioned__" ? "#3b82f6" : undefined,
                  }}
                  onDragOver={(e) => handleSectionDropZoneDragOver(e, null)}
                  onDrop={(e) => handleSectionDropZoneDrop(e, null)}
                />
              )}

              {editMode && (
                <button className={styles.addTopicBtn} onClick={() => handleAddTopic(null)}>
                  <Icon name="plus" size={12} /> Add Topic
                </button>
              )}
            </div>
          );
        })()}

        {forum.topics.length === 0 && !editMode && (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateTitle}>No topics yet</span>
            {canModerate && (
              <span className={styles.emptyStateDesc}>
                Enter edit mode to add sections and topics.
              </span>
            )}
          </div>
        )}

        {editMode && (
          <button className={styles.addSectionBtn} onClick={handleAddSection}>
            <Icon name="plus" size={14} /> Add Section
          </button>
        )}
      </div>

      {editingTopic && (
        <TopicEditModal
          topic={editingTopic}
          onClose={() => setEditingTopicId(null)}
          onUpdated={handleTopicUpdated}
        />
      )}

      {movingTopicId && forum && (
        <MoveTopicSectionModal
          topicId={movingTopicId}
          currentSectionId={forum.topics.find((t) => t.id === movingTopicId)?.sectionId ?? null}
          sections={forum.sections}
          onClose={() => setMovingTopicId(null)}
          onMoved={handleTopicMoved}
        />
      )}
    </>
  );
}

function TopicRowItem({
  topic,
  editMode,
  canModerate,
  isDragging,
  isDragOver,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
  onMove,
}: {
  topic: TopicSummary;
  editMode: boolean;
  canModerate: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const cls = [
    styles.topicRow,
    isDragging ? styles.topicRowDragging : "",
    isDragOver ? styles.topicRowDragOver : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragOver={editMode ? onDragOver : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      onClick={onClick}
    >
      {editMode && <span className={styles.dragHandle}><Icon name="drag" size={14} /></span>}

      {topic.hasIcon ? (
        <img src={`/api/forums/icons/topics/${topic.id}`} alt="" className={styles.topicRowIcon} />
      ) : (
        <div className={styles.topicRowIconPlaceholder}><Icon name="list-view" size={18} /></div>
      )}

      <div className={styles.topicRowContent}>
        <div className={styles.topicRowName}>
          {!editMode && topic.hasUnread && <span className={styles.unreadDot} />}
          {topic.name}
          {topic.locked && (
            <span className={styles.lockedBadge}><Icon name="lock" size={10} /> Locked</span>
          )}
          {topic.restricted && (
            <span className={styles.restrictedBadge}><Icon name="lock" size={10} /> Restricted</span>
          )}
        </div>
        {topic.description && (
          <div className={styles.topicRowDesc}>{topic.description}</div>
        )}
      </div>

      {!editMode && (
        <div className={styles.topicRowMeta}>
          {topic.lastPostDate ? (
            <>
              <div className={styles.topicRowMetaLabel}>LAST POST</div>
              <div className={styles.topicRowMetaLine}>
                {new Date(topic.lastPostDate).toLocaleDateString()}
              </div>
              {topic.lastPostUserName && (
                <div className={styles.topicRowMetaLine}>by {topic.lastPostUserName}</div>
              )}
            </>
          ) : (
            <div className={styles.topicRowMetaLine} style={{ color: "#334155" }}>No posts</div>
          )}
        </div>
      )}

      {editMode && (
        <div className={styles.topicRowEditActions} onClick={(e) => e.stopPropagation()}>
          <ButtonIcon name="edit" iconSize={12} label="Edit topic" onClick={onEdit} size="sm" placement="bottom" />
          <ButtonIcon name="trash" iconSize={12} label="Delete topic" onClick={onDelete} subvariant="danger" size="sm" placement="bottom" />
        </div>
      )}
      {!editMode && canModerate && (
        <div className={styles.topicRowHoverActions} onClick={(e) => e.stopPropagation()}>
          <ButtonIcon name="move" iconSize={12} label="Move to section" onClick={onMove} size="sm" placement="bottom" />
        </div>
      )}
    </div>
  );
}

function MoveTopicSectionModal({
  topicId,
  currentSectionId,
  sections,
  onClose,
  onMoved,
}: {
  topicId: string;
  currentSectionId: string | null;
  sections: SectionSummary[];
  onClose: () => void;
  onMoved: (topicId: string, newSectionId: string | null) => void;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<string>(currentSectionId ?? "__none__");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleMove = async () => {
    const newSectionId = selectedSectionId === "__none__" ? null : selectedSectionId;
    if (newSectionId === currentSectionId) { onClose(); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/forums/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: newSectionId }),
      });
      if (res.ok) {
        onMoved(topicId, newSectionId);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to move topic");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>Move Topic to Section</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleMove} disabled={saving}>
            {saving ? "Moving…" : "Move"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={360}
    >
      <div style={{ padding: 16 }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Destination Section</label>
          <select
            className={styles.formInput}
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
          >
            <option value="__none__">No section (unsectioned)</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
