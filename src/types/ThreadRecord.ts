export interface ThreadRecord {
  topicId: string;
  forumId: string;
  name: string;
  description: string;
  createdBy: string;
  pinned: boolean;
  locked: boolean;
  lastPostDate: number | null;
  lastPostUserId: string | null;
}
