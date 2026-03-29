"use client";

import React, { useState } from "react";
import type UIContext from "@sdk/types/ui-context";
import ForumList from "@/src/components/ForumList";
import ForumDetail from "@/src/components/ForumDetail";
import ForumSettings from "@/src/components/ForumSettings";
import TopicDetail from "@/src/components/TopicDetail";
import ThreadDetail from "@/src/components/ThreadDetail";
import styles from "./Forums.module.css";

type Nav =
  | { view: "list" }
  | { view: "forum"; forumId: string }
  | { view: "settings"; forumId: string; forumData: any }
  | { view: "topic"; forumId: string; topicId: string }
  | { view: "thread"; forumId: string; topicId: string; threadId: string };

interface Props {
  context: UIContext;
}

export default function Forums({ context }: Props) {
  const [nav, setNav] = useState<Nav>({ view: "list" });

  return (
    <div className={styles.app}>
      {nav.view === "list" && (
        <ForumList onOpen={(forumId) => setNav({ view: "forum", forumId })} />
      )}
      {nav.view === "forum" && (
        <ForumDetail
          forumId={nav.forumId}
          onBack={() => setNav({ view: "list" })}
          onNavigateToTopic={(topicId) =>
            setNav({ view: "topic", forumId: nav.forumId, topicId })
          }
          onNavigateToSettings={(forumData: any) =>
            setNav({ view: "settings", forumId: nav.forumId, forumData })
          }
        />
      )}
      {nav.view === "settings" && (
        <ForumSettings
          forum={nav.forumData}
          onBack={() => setNav({ view: "forum", forumId: nav.forumId })}
          onUpdated={(updates) =>
            setNav((prev) =>
              prev.view === "settings"
                ? { ...prev, forumData: { ...prev.forumData, ...updates } }
                : prev,
            )
          }
          onDeleted={() => setNav({ view: "list" })}
        />
      )}
      {nav.view === "topic" && (
        <TopicDetail
          topicId={nav.topicId}
          onBack={() => setNav({ view: "forum", forumId: nav.forumId })}
          onNavigateToForum={() => setNav({ view: "forum", forumId: nav.forumId })}
          onNavigateToThread={(threadId) =>
            setNav({
              view: "thread",
              forumId: nav.forumId,
              topicId: nav.topicId,
              threadId,
            })
          }
        />
      )}
      {nav.view === "thread" && (
        <ThreadDetail
          threadId={nav.threadId}
          onBack={() =>
            setNav({ view: "topic", forumId: nav.forumId, topicId: nav.topicId })
          }
          onNavigateToForum={() => setNav({ view: "forum", forumId: nav.forumId })}
          onNavigateToTopic={() =>
            setNav({ view: "topic", forumId: nav.forumId, topicId: nav.topicId })
          }
        />
      )}
    </div>
  );
}
