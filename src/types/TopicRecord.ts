export interface TopicRecord {
  forumId: string;
  sectionId: string | null;
  name: string;
  description: string;
  hasIcon: boolean;
  order: number;
  locked: boolean;
  restricted: boolean;
  lastPostDate: number | null;
  lastPostUserId: string | null;
}
