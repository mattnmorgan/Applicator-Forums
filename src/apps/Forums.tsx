"use client";

import React, { useState, useCallback } from "react";
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
  path?: string[];
  appId?: string;
  navigate?: (url: string) => void;
}

function initialNav(path: string[]): Nav {
  if (path[0] === "thread" && path[1] && path[2] && path[3]) {
    return { view: "thread", forumId: path[1], topicId: path[2], threadId: path[3] };
  }
  if (path[0] === "topic" && path[1] && path[2]) {
    return { view: "topic", forumId: path[1], topicId: path[2] };
  }
  if (path[0] === "forum" && path[1]) {
    return { view: "forum", forumId: path[1] };
  }
  return { view: "list" };
}

function navToUrl(nav: Nav): string {
  switch (nav.view) {
    case "forum":    return `/app/forums/forum/${nav.forumId}`;
    case "settings": return `/app/forums/forum/${nav.forumId}`;
    case "topic":    return `/app/forums/topic/${nav.forumId}/${nav.topicId}`;
    case "thread":   return `/app/forums/thread/${nav.forumId}/${nav.topicId}/${nav.threadId}`;
    default:         return `/app/forums`;
  }
}

export default function Forums({ path = [], navigate: platformNavigate }: Props) {
  const [nav, setNav] = useState<Nav>(() => initialNav(path));

  const navigate = useCallback((next: Nav) => {
    setNav(next);
    const url = navToUrl(next);
    if (platformNavigate) {
      platformNavigate(url);
    } else {
      window.history.pushState(null, "", url);
    }
  }, [platformNavigate]);

  return (
    <div className={styles.app}>
      {nav.view === "list" && (
        <ForumList onOpen={(forumId) => navigate({ view: "forum", forumId })} />
      )}
      {nav.view === "forum" && (
        <ForumDetail
          forumId={nav.forumId}
          onBack={() => navigate({ view: "list" })}
          onNavigateToTopic={(topicId) =>
            navigate({ view: "topic", forumId: nav.forumId, topicId })
          }
          onNavigateToSettings={(forumData: any) =>
            navigate({ view: "settings", forumId: nav.forumId, forumData })
          }
        />
      )}
      {nav.view === "settings" && (
        <ForumSettings
          forum={nav.forumData}
          onBack={() => navigate({ view: "forum", forumId: nav.forumId })}
          onUpdated={(updates) => {
            const next = { ...nav, forumData: { ...nav.forumData, ...updates } };
            setNav(next);
          }}
          onDeleted={() => navigate({ view: "list" })}
          onOwnershipTransferred={() => navigate({ view: "forum", forumId: nav.forumId })}
        />
      )}
      {nav.view === "topic" && (
        <TopicDetail
          topicId={nav.topicId}
          onBack={() => navigate({ view: "forum", forumId: nav.forumId })}
          onNavigateToForum={() => navigate({ view: "forum", forumId: nav.forumId })}
          onNavigateToThread={(threadId) =>
            navigate({ view: "thread", forumId: nav.forumId, topicId: nav.topicId, threadId })
          }
        />
      )}
      {nav.view === "thread" && (
        <ThreadDetail
          threadId={nav.threadId}
          onBack={() => navigate({ view: "topic", forumId: nav.forumId, topicId: nav.topicId })}
          onNavigateToForum={() => navigate({ view: "forum", forumId: nav.forumId })}
          onNavigateToTopic={() => navigate({ view: "topic", forumId: nav.forumId, topicId: nav.topicId })}
        />
      )}
    </div>
  );
}
