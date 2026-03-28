"use client";

import React, { useState } from "react";
import { Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface Thread {
  id: string;
  name: string;
  description: string;
}

interface Props {
  thread: Thread;
  onClose: () => void;
  onUpdated: (updated: Thread) => void;
}

export default function EditThreadModal({ thread, onClose, onUpdated }: Props) {
  const [name, setName] = useState(thread.name);
  const [description, setDescription] = useState(thread.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/forums/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok) {
        onUpdated({ ...thread, name: name.trim(), description: description.trim() });
      } else {
        const err = await res.json();
        setError(err.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>Edit Thread</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={480}
    >
      <div style={{ padding: "4px 0" }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Thread Title</label>
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
          />
        </div>
      </div>
    </Modal>
  );
}
