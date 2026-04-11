"use client";

import { useState } from "react";
import { Modal, Button, ImageUpload } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";

interface ForumData {
  id: string;
  name: string;
  description: string;
  hasIcon: boolean;
}

interface Props {
  forum: ForumData;
  onClose: () => void;
  onUpdated: (updates: Partial<ForumData>) => void;
  onDeleted: () => void;
}

export default function ForumSettingsModal({ forum, onClose, onUpdated, onDeleted }: Props) {
  const [name, setName] = useState(forum.name);
  const [description, setDescription] = useState(forum.description || "");
  const [iconPreview, setIconPreview] = useState<string | null>(
    forum.hasIcon ? `/api/forums/icons/forums/${forum.id}` : null,
  );
  const [pendingIcon, setPendingIcon] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Update name/description
      const patchRes = await fetch(`/api/forums/forums/${forum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        setError(err.error || "Failed to save");
        return;
      }

      // Upload icon if changed
      if (pendingIcon) {
        const formData = new FormData();
        formData.append("file", pendingIcon);
        await fetch(`/api/forums/forums/${forum.id}/icon`, { method: "POST", body: formData });
        onUpdated({ name: name.trim(), description: description.trim(), hasIcon: true });
      } else {
        onUpdated({ name: name.trim(), description: description.trim() });
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/forums/forums/${forum.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to delete");
        setConfirmDelete(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      header={<span className={styles.modalTitle}>Forum Settings</span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
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
          <ImageUpload
            label="Icon"
            value={iconPreview}
            onChange={setIconPreview}
            onFileSelect={setPendingIcon}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>Forum Name</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
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

        <div className={styles.dangerZone}>
          <div className={styles.dangerZoneTitle}>Danger Zone</div>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>
                This will permanently delete the forum and all content. Are you sure?
              </span>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete Forum
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
