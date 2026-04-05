"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, Button, ButtonIcon, ProfileIndicator, SearchableCombobox, Icon } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import { SystemUser } from "@/src/types/SystemUser";

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

interface TopicAccessEntry {
  id: string;
  type: "user" | "authority";
  userId?: string;
  displayName?: string;
  username?: string;
  profilePicture?: string | null;
  authorityId?: string;
  authorityName?: string;
}

interface AuthorityOption {
  id: string;
  name: string;
}

interface Props {
  topic: TopicSummary;
  onClose: () => void;
  onUpdated: (updated: TopicSummary) => void;
}

export default function TopicEditModal({ topic, onClose, onUpdated }: Props) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description || "");
  const [restricted, setRestricted] = useState(topic.restricted);
  const [iconPreview, setIconPreview] = useState<string | null>(
    topic.hasIcon ? `/api/forums/icons/topics/${topic.id}` : null,
  );
  const [pendingIcon, setPendingIcon] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Access management state
  const [accessEntries, setAccessEntries] = useState<TopicAccessEntry[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOption[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [addMode, setAddMode] = useState<"user" | "authority">("user");
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedAuthority, setSelectedAuthority] = useState<AuthorityOption | null>(null);
  const [addingAccess, setAddingAccess] = useState(false);
  const [accessError, setAccessError] = useState("");

  // Load access entries when restricted is on
  useEffect(() => {
    if (!restricted) return;
    const load = async () => {
      setAccessLoading(true);
      try {
        const [entriesRes, usersRes, authRes] = await Promise.all([
          fetch(`/api/forums/topics/${topic.id}/access`),
          fetch("/api/forums/users"),
          fetch("/api/forums/authorities"),
        ]);
        if (entriesRes.ok) setAccessEntries((await entriesRes.json()).entries || []);
        if (usersRes.ok) setUsers((await usersRes.json()).users || []);
        if (authRes.ok) setAuthorities((await authRes.json()).authorities || []);
      } finally {
        setAccessLoading(false);
      }
    };
    load();
  }, [restricted, topic.id]);

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
        body: JSON.stringify({ name: name.trim(), description: description.trim(), restricted }),
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
      onUpdated({ ...topic, name: name.trim(), description: description.trim(), restricted, hasIcon });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccess = async () => {
    if (addMode === "user" && !selectedUser) return;
    if (addMode === "authority" && !selectedAuthority) return;
    setAddingAccess(true);
    setAccessError("");
    try {
      const body = addMode === "user"
        ? { userId: selectedUser!.id }
        : { authorityId: selectedAuthority!.id };
      const res = await fetch(`/api/forums/topics/${topic.id}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setAccessEntries((prev) => [...prev, data]);
        setSelectedUser(null);
        setSelectedAuthority(null);
      } else {
        const err = await res.json();
        setAccessError(err.error || "Failed to add");
      }
    } finally {
      setAddingAccess(false);
    }
  };

  const handleRemoveAccess = async (entryId: string) => {
    const res = await fetch(`/api/forums/topics/${topic.id}/access/${entryId}`, { method: "DELETE" });
    if (res.ok) setAccessEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const grantedUserIds = new Set(accessEntries.filter((e) => e.type === "user").map((e) => e.userId!));
  const grantedAuthorityIds = new Set(accessEntries.filter((e) => e.type === "authority").map((e) => e.authorityId!));
  const availableUsers = users.filter((u) => !grantedUserIds.has(u.id));
  const availableAuthorities = authorities.filter((a) => !grantedAuthorityIds.has(a.id));

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
      maxWidth={520}
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
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Choose Image</Button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleIconChange} />
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.formLabel}>Topic Name</label>
          <input className={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

        {/* Restricted toggle */}
        <div className={styles.formRow} style={{ alignItems: "flex-start" }}>
          <label className={styles.formLabel} style={{ paddingTop: 2 }}>Restricted</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setRestricted((v) => !v)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "none",
                background: restricted ? "#3b82f6" : "#334155",
                cursor: "pointer",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.15s",
                padding: 0,
                outline: "none",
              }}
            >
              <span style={{
                display: "block",
                position: "absolute",
                top: 2,
                left: restricted ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.15s",
              }} />
            </button>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {restricted ? "Only granted users/authorities can access this topic" : "Visible to all forum members"}
            </span>
          </div>
        </div>

        {/* Access management (only when restricted) */}
        {restricted && (
          <div style={{ marginTop: 16, borderTop: "1px solid #1e293b", paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Access Grants
            </div>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
              Moderators always have access. Grant access to specific users or authorities below.
            </p>

            {accessError && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{accessError}</div>}

            {/* Add access form */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, minWidth: 0 }}>
              <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #1e293b", flexShrink: 0 }}>
                {(["user", "authority"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAddMode(mode)}
                    style={{
                      padding: "0 8px",
                      height: 30,
                      background: addMode === mode ? "#1e3a5f" : "transparent",
                      color: addMode === mode ? "#e2e8f0" : "#64748b",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: addMode === mode ? 600 : 400,
                    }}
                  >
                    {mode === "user" ? "User" : "Authority"}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {addMode === "user" ? (
                  <SearchableCombobox<SystemUser>
                    items={availableUsers}
                    selectedItems={selectedUser ? [selectedUser] : []}
                    onSelectionChange={(sel) => setSelectedUser(sel[0] ?? null)}
                    renderItem={(u) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ProfileIndicator displayName={u.displayName} profilePicture={u.profilePicture || undefined} />
                        <span style={{ fontSize: 11, color: "#64748b" }}>@{u.username}</span>
                      </div>
                    )}
                    filterItem={(u, term) =>
                      u.displayName.toLowerCase().includes(term.toLowerCase()) ||
                      u.username.toLowerCase().includes(term.toLowerCase())
                    }
                    getItemKey={(u) => u.id}
                    placeholder="Search users…"
                  />
                ) : (
                  <SearchableCombobox<AuthorityOption>
                    items={availableAuthorities}
                    selectedItems={selectedAuthority ? [selectedAuthority] : []}
                    onSelectionChange={(sel) => setSelectedAuthority(sel[0] ?? null)}
                    renderItem={(a) => <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.name}</span>}
                    filterItem={(a, term) => a.name.toLowerCase().includes(term.toLowerCase())}
                    getItemKey={(a) => a.id}
                    placeholder="Search authorities…"
                  />
                )}
              </div>
              <Button
                variant="primary"
                onClick={handleAddAccess}
                disabled={(addMode === "user" ? !selectedUser : !selectedAuthority) || addingAccess}
              >
                {addingAccess ? "Adding…" : "Add"}
              </Button>
            </div>

            {/* Access list */}
            {accessLoading ? (
              <div style={{ color: "#64748b", fontSize: 12 }}>Loading…</div>
            ) : accessEntries.length === 0 ? (
              <div style={{ color: "#475569", fontSize: 12 }}>No grants yet — only moderators can access this topic.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {accessEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      background: "#0f172a",
                      borderRadius: 6,
                      border: "1px solid #1e293b",
                    }}
                  >
                    {entry.type === "user" ? (
                      <>
                        <ProfileIndicator displayName={entry.displayName!} profilePicture={entry.profilePicture || undefined} />
                        <span style={{ fontSize: 12, color: "#64748b" }}>@{entry.username}</span>
                      </>
                    ) : (
                      <>
                        <Icon name="users" size={14} />
                        <span style={{ fontSize: 13, color: "#e2e8f0" }}>{entry.authorityName}</span>
                        <span style={{ fontSize: 10, color: "#475569", background: "#1e293b", borderRadius: 3, padding: "1px 5px" }}>Authority</span>
                      </>
                    )}
                    <div style={{ marginLeft: "auto" }}>
                      <ButtonIcon
                        name="trash"
                        iconSize={12}
                        label="Remove access"
                        onClick={() => handleRemoveAccess(entry.id)}
                        subvariant="danger"
                        placement="top"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
