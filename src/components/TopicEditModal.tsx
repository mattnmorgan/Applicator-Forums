"use client";

import React, { useState, useRef } from "react";
import { Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface TopicSummary {
  id: string;
  name: string;
  description: string;
  hasIcon: boolean;
  sectionId: string | null;
  order: number;
  locked: boolean;
  lastPostDate: number | null;
  lastPostUserName: string | null;
}

interface Props {
  topic: TopicSummary;
  onClose: () => void;
  onUpdated: (updated: TopicSummary) => void;
}

export default function TopicEditModal({ topic, onClose, onUpdated }: Props) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description || "");
  const [iconPreview, setIconPreview] = useState<string | null>(
    topic.hasIcon ? `/api/forums/icons/topics/${topic.id}` : null,
  );
  const [pendingIcon, setPendingIcon] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingIcon(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const patchRes = await fetch(`/api/forums/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        setError(err.error || "Failed to save");
        return;
      }

      let hasIcon = topic.hasIcon;
      if (pendingIcon) {
        const formData = new FormData();
        formData.append("file", pendingIcon);
        await fetch(`/api/forums/topics/${topic.id}/icon`, { method: "POST", body: formData });
        hasIcon = true;
      }

      onUpdated({ ...topic, name: name.trim(), description: description.trim(), hasIcon });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>Edit Topic</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={480}
    >
      <div style={{ padding: 16 }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div className={styles.formRow}>
          <label className={styles.formLabel}>Icon</label>
          <div className={styles.iconUploadArea}>
            {iconPreview ? (
              <img src={iconPreview} alt="" className={styles.iconPreview} />
            ) : (
              <div className={styles.iconPreviewPlaceholder}>
                <span style={{ fontSize: 11, color: "#475569" }}>None</span>
              </div>
            )}
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleIconChange}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>Topic Name</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>Description</label>
          <textarea
            className={styles.formTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this topic about?"
          />
        </div>
      </div>
    </Modal>
  );
}
