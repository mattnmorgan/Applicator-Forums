"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Icon,
  Button,
  DrawerLayout,
  ProfileIndicator,
  SearchableCombobox,
} from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import { SystemUser } from "@/src/types/SystemUser";

interface ForumData {
  id: string;
  name: string;
  description: string;
  hasIcon: boolean;
}

interface ShareEntry {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  profilePicture: string | null;
  role: "moderator" | "member" | "viewer";
}

interface Props {
  forum: ForumData;
  onBack: () => void;
  onUpdated: (updates: Partial<ForumData>) => void;
  onDeleted: () => void;
}

export default function ForumSettings({
  forum,
  onBack,
  onUpdated,
  onDeleted,
}: Props) {
  const [activeTab, setActiveTab] = useState<"general" | "members" | "delete">(
    "general",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const tabs: {
    id: "general" | "members" | "delete";
    label: string;
    danger?: boolean;
  }[] = [
    { id: "general", label: "General" },
    { id: "members", label: "Members" },
    { id: "delete", label: "Delete", danger: true },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
        </button>

        {forum.hasIcon ? (
          <img
            src={`/api/forums/icons/forums/${forum.id}`}
            alt=""
            className={styles.headerIcon}
          />
        ) : (
          <div className={styles.headerIconPlaceholder}>
            <Icon name="users" size={14} />
          </div>
        )}

        <span className={styles.headerTitle}>
          {forum.name}
          <span style={{ color: "#475569", fontWeight: 400 }}> / Settings</span>
        </span>
      </div>

      {/* DrawerLayout fills remaining height */}
      <DrawerLayout
        rounded={false}
        style={{ flex: 1, minHeight: 0 }}
        leftPanel={{
          open: sidebarOpen,
          type: "inline",
          pixelWidth: 200,
          scrollable: false,
          closeable: true,
          openable: true,
          iconName: "hamburger",
          background: "#151f2e",
          contentPadding: "8px",
          onClose: () => setSidebarOpen(false),
          onOpen: () => setSidebarOpen(true),
          children: (
            <nav>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={[
                    styles.settingsNavItem,
                    activeTab === tab.id ? styles.settingsNavItemActive : "",
                    tab.danger ? styles.settingsNavItemDanger : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </div>
              ))}
            </nav>
          ),
        }}
      >
        <div className={styles.settingsContent}>
          {activeTab === "general" && (
            <GeneralTab forum={forum} onUpdated={onUpdated} />
          )}
          {activeTab === "members" && <MembersTab forumId={forum.id} />}
          {activeTab === "delete" && (
            <DeleteTab forum={forum} onDeleted={onDeleted} />
          )}
        </div>
      </DrawerLayout>
    </div>
  );
}

function GeneralTab({
  forum,
  onUpdated,
}: {
  forum: ForumData;
  onUpdated: (updates: Partial<ForumData>) => void;
}) {
  const [name, setName] = useState(forum.name);
  const [description, setDescription] = useState(forum.description || "");
  const [iconPreview, setIconPreview] = useState<string | null>(
    forum.hasIcon ? `/api/forums/icons/forums/${forum.id}` : null,
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
    setSaving(true);
    setError("");
    try {
      const patchRes = await fetch(`/api/forums/forums/${forum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        setError(err.error || "Failed to save");
        return;
      }

      let hasIcon = forum.hasIcon;
      if (pendingIcon) {
        const formData = new FormData();
        formData.append("file", pendingIcon);
        await fetch(`/api/forums/forums/${forum.id}/icon`, {
          method: "POST",
          body: formData,
        });
        hasIcon = true;
        setPendingIcon(null);
      }

      onUpdated({
        name: name.trim(),
        description: description.trim(),
        hasIcon,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
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
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
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

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}

function MembersTab({ forumId }: { forumId: string }) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<
    "moderator" | "member" | "viewer"
  >("member");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sharesRes, usersRes] = await Promise.all([
          fetch(`/api/forums/forums/${forumId}/shares`),
          fetch("/api/forums/users"),
        ]);
        if (sharesRes.ok) setShares((await sharesRes.json()).shares || []);
        if (usersRes.ok) setUsers((await usersRes.json()).users || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [forumId]);

  const handleAdd = async () => {
    if (!selectedUser) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch(`/api/forums/forums/${forumId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser.id, role: selectedRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setShares((prev) => [...prev, data]);
        setSelectedUser(null);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to share");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (shareId: string, newRole: string) => {
    const res = await fetch(`/api/forums/forums/${forumId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const data = await res.json();
      setShares((prev) =>
        prev.map((s) =>
          s.id === shareId ? { ...s, id: data.id, role: newRole as any } : s,
        ),
      );
    }
  };

  const handleRevoke = async (shareId: string) => {
    const res = await fetch(`/api/forums/forums/${forumId}/shares/${shareId}`, {
      method: "DELETE",
    });
    if (res.ok) setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const alreadySharedIds = new Set(shares.map((s) => s.userId));
  const availableUsers = users.filter((u) => !alreadySharedIds.has(u.id));

  return (
    <div>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1 }}>
          <SearchableCombobox<SystemUser>
            items={availableUsers}
            selectedItems={selectedUser ? [selectedUser] : []}
            onSelectionChange={(sel) => setSelectedUser(sel[0] ?? null)}
            renderItem={(u) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ProfileIndicator
                  displayName={u.displayName}
                  profilePicture={u.profilePicture || undefined}
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  @{u.username}
                </span>
              </div>
            )}
            filterItem={(u, term) =>
              u.displayName.toLowerCase().includes(term.toLowerCase()) ||
              u.username.toLowerCase().includes(term.toLowerCase())
            }
            getItemKey={(u) => u.id}
            placeholder="Search users…"
          />
        </div>
        <select
          className={styles.roleSelect}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as any)}
          style={{ height: 36 }}
        >
          <option value="moderator">Moderator</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={!selectedUser || adding}
        >
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>

      {loading ? (
        <div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div>
      ) : (
        <div className={styles.shareTableWrap}>
          <table className={styles.shareTable}>
            <thead>
              <tr>
                <th className={styles.shareTableHeader}>Member</th>
                <th className={styles.shareTableHeader} style={{ width: 130 }}>Role</th>
                <th className={styles.shareTableHeader} style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {shares.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.shareRowCell} style={{ color: "#64748b", fontSize: 13 }}>
                    No members yet.
                  </td>
                </tr>
              ) : (
                shares.map((share) => (
                  <tr key={share.id} className={styles.shareRow}>
                    <td className={styles.shareRowCell}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ProfileIndicator
                          displayName={share.displayName}
                          profilePicture={share.profilePicture || undefined}
                        />
                        <span style={{ fontSize: 11, color: "#64748b" }}>@{share.username}</span>
                      </div>
                    </td>
                    <td className={styles.shareRowCell}>
                      <select
                        className={styles.roleSelect}
                        value={share.role}
                        onChange={(e) => handleRoleChange(share.id, e.target.value)}
                      >
                        <option value="moderator">Moderator</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className={styles.shareRowCell} style={{ textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        onClick={() => handleRevoke(share.id)}
                        style={{ color: "#ef4444", fontSize: 12 }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeleteTab({
  forum,
  onDeleted,
}: {
  forum: ForumData;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/forums/forums/${forum.id}`, {
        method: "DELETE",
      });
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
    <div style={{ maxWidth: 480 }}>
      <div className={styles.dangerZoneTitle} style={{ marginBottom: 8 }}>
        Delete Forum
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#94a3b8",
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        This will permanently delete the forum, all sections, topics, threads,
        and messages. This action cannot be undone.
      </p>
      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {confirmDelete ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Are you sure?</span>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, Delete"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete Forum
        </Button>
      )}
    </div>
  );
}
