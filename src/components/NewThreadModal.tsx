"use client";

import React, { useState } from "react";
import { Modal, Button, RichTextEditor } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface Props {
  topicId: string;
  onClose: () => void;
  onCreated: (thread: any) => void;
}

export default function NewThreadModal({ topicId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/forums/topics/${topicId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          content: contentHtml,
        }),
      });
      if (res.ok) {
        onCreated(await res.json());
      } else {
        const err = await res.json();
        setError(err.error || "Failed to create thread");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>New Thread</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create Thread"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={600}
    >
      <div style={{ padding: 16 }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Thread Title</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What is this thread about?"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Description (optional)</label>
          <input
            className={styles.formInput}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this thread…"
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>First Post</label>
          <RichTextEditor
            value={contentHtml}
            onChange={setContentHtml}
            placeholder="Write the first message of this thread…"
            minHeight={120}
            disabled={saving}
          />
        </div>
      </div>
    </Modal>
  );
}
