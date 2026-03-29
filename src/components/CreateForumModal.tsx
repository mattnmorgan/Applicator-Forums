"use client";

import React, { useState, useRef } from "react";
import { Modal, Button } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface Props {
  onClose: () => void;
  onCreated: (forum: any) => void;
}

export default function CreateForumModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconPreview, setIconPreview] = useState<string | null>(null);
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
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create forum");
        return;
      }
      const data = await res.json();

      if (pendingIcon) {
        const formData = new FormData();
        formData.append("file", pendingIcon);
        await fetch(`/api/forums/forums/${data.id}/icon`, { method: "POST", body: formData });
        data.hasIcon = true;
      }

      onCreated(data);
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
      <div style={{ padding: 16 }}>
        {error && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
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
