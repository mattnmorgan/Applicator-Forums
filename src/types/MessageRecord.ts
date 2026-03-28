export interface MessageRecord {
  threadId: string;
  forumId: string;
  content: string;
  authorId: string;
  edited: boolean;
  editedAt: number | null;
  removed: boolean;
}
