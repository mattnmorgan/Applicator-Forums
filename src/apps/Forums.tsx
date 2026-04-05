"use client";

import React, { useState, useCallback, useEffect } from "react";
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
  | { view: "settings-loading"; forumId: string }
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
  if (path[0] === "settings" && path[1]) {
    return { view: "settings-loading", forumId: path[1] };
  }
  if (path[0] === "forum" && path[1]) {
    return { view: "forum", forumId: path[1] };
  }
  return { view: "list" };
}

function navToUrl(nav: Nav): string {
  switch (nav.view) {
    case "forum":            return `/app/forums:main/forum/${nav.forumId}`;
    case "settings":
    case "settings-loading": return `/app/forums:main/settings/${nav.forumId}`;
    case "topic":            return `/app/forums:main/topic/${nav.forumId}/${nav.topicId}`;
    case "thread":           return `/app/forums:main/thread/${nav.forumId}/${nav.topicId}/${nav.threadId}`;
    default:                 return `/app/forums:main`;
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

  // Resolve settings-loading: fetch forum data then transition to settings
  useEffect(() => {
    if (nav.view !== "settings-loading") return;
    const { forumId } = nav;
    fetch(`/api/forums/forums/${forumId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setNav({ view: "settings", forumId, forumData: data });
        } else {
          setNav({ view: "forum", forumId });
        }
      })
      .catch(() => setNav({ view: "forum", forumId }));
  }, [nav]);

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
          onNavigateToSettings={() =>
            navigate({ view: "settings-loading", forumId: nav.forumId })
          }
        />
      )}
      {nav.view === "settings-loading" && (
        <div className={styles.loading}>Loading settings…</div>
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
