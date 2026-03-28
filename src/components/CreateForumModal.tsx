"use client";

import React, { useState } from "react";
import { Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface Props {
  onClose: () => void;
  onCreated: (forum: any) => void;
}

export default function CreateForumModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/forums/forums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        onCreated(data);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to create forum");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>New Forum</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create Forum"}
          </Button>
        </>
      }
      closeable
      onClose={onClose}
      maxWidth={480}
    >
      <div style={{ padding: "4px 0" }}>
        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Forum Name</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. General Discussion"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Description</label>
          <textarea
            className={styles.formTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this forum about?"
          />
        </div>
      </div>
    </Modal>
  );
}
