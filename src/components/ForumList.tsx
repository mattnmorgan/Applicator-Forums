"use client";

import React, { useState, useEffect } from "react";
import { Icon, ButtonIcon, ProfileIndicator, Tooltip } from "@applicator/sdk/components";
import styles from "@/src/apps/Forums.module.css";
import CreateForumModal from "./CreateForumModal";

interface ForumSummary {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  ownerProfilePicture?: string | null;
  hasIcon: boolean;
  role: string;
}

interface Props {
  onOpen: (forumId: string) => void;
}

export default function ForumList({ onOpen }: Props) {
  const [owned, setOwned] = useState<ForumSummary[]>([]);
  const [shared, setShared] = useState<ForumSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [canCreate, setCanCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/forums/forums");
      if (res.ok) {
        const data = await res.json();
        setOwned(data.owned || []);
        setShared(data.shared || []);
        setCanCreate(!!data.canCreate);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleForumCreated = (forum: ForumSummary) => {
    setOwned((prev) => [...prev, forum]);
    setShowCreate(false);
  };

  if (loading) return <div className={styles.loading}>Loading forums…</div>;

  return (
    <div className={styles.body}>
      <div className={styles.listSection}>
        <div className={styles.listSectionHeader}>
          <span className={styles.listSectionTitle}>My Forums</span>
          {canCreate && (
            <ButtonIcon
              name="plus"
              label="Create a new forum"
              onClick={() => setShowCreate(true)}
              size="sm"
              placement="bottom"
            />
          )}
        </div>

        {owned.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateTitle}>No forums yet</span>
            <span className={styles.emptyStateDesc}>
              Create a forum to start organizing discussions.
            </span>
          </div>
        )}

        {owned.map((f) => (
          <ForumRowItem key={f.id} forum={f} onClick={() => onOpen(f.id)} />
        ))}

      </div>

      {shared.length > 0 && (
        <div className={styles.listSection}>
          <div className={styles.listSectionHeader}>
            <span className={styles.listSectionTitle}>Shared With Me</span>
          </div>
          {shared.map((f) => (
            <ForumRowItem
              key={f.id}
              forum={f}
              onClick={() => onOpen(f.id)}
              showOwner
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateForumModal
          onClose={() => setShowCreate(false)}
          onCreated={handleForumCreated}
        />
      )}
    </div>
  );
}

function ForumRowItem({
  forum,
  onClick,
  showOwner,
}: {
  forum: ForumSummary;
  onClick: () => void;
  showOwner?: boolean;
}) {
  return (
    <div className={styles.forumRow} onClick={onClick}>
      {forum.hasIcon ? (
        <img
          src={`/api/forums/icons/forums/${forum.id}`}
          alt=""
          className={styles.forumRowIcon}
        />
      ) : (
        <div className={styles.forumRowIconPlaceholder}>
          <Icon name="users" size={18} />
        </div>
      )}
      <div className={styles.forumRowContent}>
        <div className={styles.forumRowName}>{forum.name}</div>
        {forum.description && (
          <div className={styles.forumRowDesc}>{forum.description}</div>
        )}
      </div>
      {showOwner && (
        <Tooltip text={forum.ownerName} placement="top">
          <ProfileIndicator
            displayName={forum.ownerName}
            profilePicture={forum.ownerProfilePicture || undefined}
          />
        </Tooltip>
      )}
    </div>
  );
}
