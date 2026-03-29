"use client";

import React, { useState, useEffect } from "react";
import { Modal, Button, ProfileIndicator, SearchableCombobox } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import { SystemUser } from "@/src/types/SystemUser";

interface ShareEntry {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  profilePicture: string | null;
  role: "moderator" | "member" | "viewer";
}

interface Props {
  forumId: string;
  forumName: string;
  onClose: () => void;
}

export default function ShareModal({ forumId, forumName, onClose }: Props) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<"moderator" | "member" | "viewer">("member");
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
      setShares((prev) => prev.map((s) => s.id === shareId ? { ...s, id: data.id, role: newRole as any } : s));
    }
  };

  const handleRevoke = async (shareId: string) => {
    const res = await fetch(`/api/forums/forums/${forumId}/shares/${shareId}`, { method: "DELETE" });
    if (res.ok) setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const alreadySharedIds = new Set(shares.map((s) => s.userId));
  const availableUsers = users.filter((u) => !alreadySharedIds.has(u.id));

  return (
    <Modal
      header={<span className={styles.modalTitle}>Share — {forumName}</span>}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
      closeable
      onClose={onClose}
      maxWidth={520}
    >
      <div style={{ padding: "4px 0" }}>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {/* Add new share */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <SearchableCombobox<SystemUser>
              items={availableUsers}
              selectedItems={selectedUser ? [selectedUser] : []}
              onSelectionChange={(sel) => setSelectedUser(sel[0] ?? null)}
              renderItem={(u) => (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ProfileIndicator displayName={u.displayName} profilePicture={u.profilePicture || undefined} />
                  <span style={{ fontSize: 13, color: "#e2e8f0" }}>{u.displayName}</span>
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

        {/* Existing shares */}
        {loading ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div>
        ) : (
          <table className={styles.shareTable}>
            <thead>
              <tr>
                <th className={styles.shareTableHeader}>Member</th>
                <th className={styles.shareTableHeader}>Role</th>
                <th className={styles.shareTableHeader} />
              </tr>
            </thead>
            <tbody>
              {shares.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "#64748b", fontSize: 13, padding: "10px 0" }}>
                    No members yet.
                  </td>
                </tr>
              ) : (
                shares.map((share) => (
                  <tr key={share.id} className={styles.shareRow}>
                    <td className={styles.shareRowCell}>
                      <ProfileIndicator
                        displayName={share.displayName}
                        profilePicture={share.profilePicture || undefined}
                      />
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
        )}
      </div>
    </Modal>
  );
}
