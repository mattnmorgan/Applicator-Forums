"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Icon,
  Button,
  ButtonIcon,
  DrawerLayout,
  Modal,
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
  access?: string;
}

interface ShareEntry {
  id: string;
  type: "user" | "authority";
  userId?: string;
  displayName?: string;
  username?: string;
  profilePicture?: string | null;
  authorityId?: string;
  authorityName?: string;
  role: "moderator" | "member" | "viewer";
}

interface AuthorityOption {
  id: string;
  name: string;
}

interface Props {
  forum: ForumData;
  onBack: () => void;
  onUpdated: (updates: Partial<ForumData>) => void;
  onDeleted: () => void;
  onOwnershipTransferred: () => void;
}

export default function ForumSettings({ forum, onBack, onUpdated, onDeleted, onOwnershipTransferred }: Props) {
  const isOwner = forum.access === "owner";
  const [activeTab, setActiveTab] = useState<"general" | "members" | "delete">("general");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const tabs: { id: "general" | "members" | "delete"; label: string; danger?: boolean }[] = [
    { id: "general", label: "General" },
    { id: "members", label: "Members" },
    ...(isOwner ? [{ id: "delete" as const, label: "Delete", danger: true }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <Icon name="chevron-left" size={16} />
        </button>
        {forum.hasIcon ? (
          <img src={`/api/forums/icons/forums/${forum.id}`} alt="" className={styles.headerIcon} />
        ) : (
          <div className={styles.headerIconPlaceholder}><Icon name="users" size={14} /></div>
        )}
        <span className={styles.headerTitle}>
          {forum.name}
          <span style={{ color: "#475569", fontWeight: 400 }}> / Settings</span>
        </span>
      </div>

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
                  ].filter(Boolean).join(" ")}
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
          {activeTab === "general" && <GeneralTab forum={forum} onUpdated={onUpdated} />}
          {activeTab === "members" && (
            <MembersTab
              forumId={forum.id}
              isOwner={isOwner}
              onOwnershipTransferred={onOwnershipTransferred}
            />
          )}
          {activeTab === "delete" && isOwner && <DeleteTab forum={forum} onDeleted={onDeleted} />}
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
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
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
        await fetch(`/api/forums/forums/${forum.id}/icon`, { method: "POST", body: formData });
        hasIcon = true;
        setPendingIcon(null);
      }
      onUpdated({ name: name.trim(), description: description.trim(), hasIcon });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
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
        <label className={styles.formLabel}>Forum Name</label>
        <input className={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Description</label>
        <textarea className={styles.formTextarea} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}

function MembersTab({
  forumId,
  isOwner,
  onOwnershipTransferred,
}: {
  forumId: string;
  isOwner: boolean;
  onOwnershipTransferred: () => void;
}) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [authorities, setAuthorities] = useState<AuthorityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<"user" | "authority">("user");
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedAuthority, setSelectedAuthority] = useState<AuthorityOption | null>(null);
  const [selectedRole, setSelectedRole] = useState<"moderator" | "member" | "viewer">("member");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [promoteTarget, setPromoteTarget] = useState<ShareEntry | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sharesRes, usersRes, authRes] = await Promise.all([
          fetch(`/api/forums/forums/${forumId}/shares`),
          fetch("/api/forums/users"),
          fetch("/api/forums/authorities"),
        ]);
        if (sharesRes.ok) setShares((await sharesRes.json()).shares || []);
        if (usersRes.ok) setUsers((await usersRes.json()).users || []);
        if (authRes.ok) setAuthorities((await authRes.json()).authorities || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [forumId]);

  const handleAdd = async () => {
    if (addMode === "user" && !selectedUser) return;
    if (addMode === "authority" && !selectedAuthority) return;
    setAdding(true);
    setError("");
    try {
      const body = addMode === "user"
        ? { userId: selectedUser!.id, role: selectedRole }
        : { authorityId: selectedAuthority!.id, role: selectedRole };
      const res = await fetch(`/api/forums/forums/${forumId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setShares((prev) => [...prev, data]);
        setSelectedUser(null);
        setSelectedAuthority(null);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to add");
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
      setShares((prev) => prev.map((s) => s.id === shareId ? { ...s, id: data.id, role: newRole as any } : s));
    }
  };

  const handleRevoke = async (shareId: string) => {
    const res = await fetch(`/api/forums/forums/${forumId}/shares/${shareId}`, { method: "DELETE" });
    if (res.ok) setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const handleConfirmPromote = async () => {
    if (!promoteTarget) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/forums/forums/${forumId}/shares/${promoteTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promote: true }),
      });
      if (res.ok) {
        onOwnershipTransferred();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to transfer ownership");
        setPromoteTarget(null);
      }
    } finally {
      setPromoting(false);
    }
  };

  const alreadySharedUserIds = new Set(shares.filter((s) => s.type === "user").map((s) => s.userId!));
  const alreadySharedAuthorityIds = new Set(shares.filter((s) => s.type === "authority").map((s) => s.authorityId!));
  const availableUsers = users.filter((u) => !alreadySharedUserIds.has(u.id));
  const availableAuthorities = authorities.filter((a) => !alreadySharedAuthorityIds.has(a.id));

  return (
    <div>
      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {/* Add form */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #1e293b", flexShrink: 0 }}>
          {(["user", "authority"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAddMode(mode)}
              style={{
                padding: "0 10px",
                height: 36,
                background: addMode === mode ? "#1e3a5f" : "transparent",
                color: addMode === mode ? "#e2e8f0" : "#64748b",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
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
              renderItem={(a) => (
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.name}</span>
              )}
              filterItem={(a, term) => a.name.toLowerCase().includes(term.toLowerCase())}
              getItemKey={(a) => a.id}
              placeholder="Search authorities…"
            />
          )}
        </div>

        <select
          className={styles.roleSelect}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as any)}
          style={{ height: 36, flexShrink: 0 }}
        >
          <option value="moderator">Moderator</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={(addMode === "user" ? !selectedUser : !selectedAuthority) || adding}
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
                <th className={styles.shareTableHeader} style={{ width: isOwner ? 72 : 40 }} />
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
                [...shares].sort((a, b) => {
                  if (a.type !== b.type) return a.type === "user" ? -1 : 1;
                  const aName = a.type === "user" ? (a.displayName || "") : (a.authorityName || "");
                  const bName = b.type === "user" ? (b.displayName || "") : (b.authorityName || "");
                  return aName.localeCompare(bName);
                }).map((share) => (
                  <tr key={share.id} className={styles.shareRow}>
                    <td className={styles.shareRowCell}>
                      {share.type === "user" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ProfileIndicator
                            displayName={share.displayName!}
                            profilePicture={share.profilePicture || undefined}
                          />
                          <span style={{ fontSize: 11, color: "#64748b" }}>@{share.username}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "#1e293b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <Icon name="users" size={13} />
                          </div>
                          <span style={{ fontSize: 13, color: "#e2e8f0" }}>{share.authorityName}</span>
                          <span style={{ fontSize: 10, color: "#475569", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 3, padding: "1px 5px" }}>Authority</span>
                        </div>
                      )}
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
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                        {isOwner && share.type === "user" && (
                          <ButtonIcon
                            name="crown"
                            iconSize={13}
                            label="Transfer ownership"
                            onClick={() => setPromoteTarget(share)}
                            placement="top"
                          />
                        )}
                        <ButtonIcon
                          name="trash"
                          iconSize={13}
                          label="Remove"
                          onClick={() => handleRevoke(share.id)}
                          subvariant="danger"
                          placement="top"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Ownership transfer confirmation modal */}
      {promoteTarget && (
        <Modal
          header={<span className={styles.modalTitle}>Transfer Ownership</span>}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPromoteTarget(null)} disabled={promoting}>Cancel</Button>
              <Button variant="danger" onClick={handleConfirmPromote} disabled={promoting}>
                {promoting ? "Transferring…" : "Transfer Ownership"}
              </Button>
            </>
          }
          closeable
          onClose={() => setPromoteTarget(null)}
          maxWidth={420}
        >
          <div style={{ padding: "8px 16px 16px" }}>
            <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
              Transfer ownership of this forum to{" "}
              <strong style={{ color: "#e2e8f0" }}>
                {promoteTarget.displayName}
              </strong>
              ? You will become a moderator and lose owner privileges. This cannot be undone.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DeleteTab({ forum, onDeleted }: { forum: ForumData; onDeleted: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

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
    <div style={{ maxWidth: 480 }}>
      <div className={styles.dangerZoneTitle} style={{ marginBottom: 8 }}>Delete Forum</div>
      <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20, lineHeight: 1.6 }}>
        This will permanently delete the forum, all sections, topics, threads, and messages. This action cannot be undone.
      </p>
      {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {confirmDelete ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Are you sure?</span>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, Delete"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete Forum</Button>
      )}
    </div>
  );
}
