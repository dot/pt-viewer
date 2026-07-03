// Row shapes returned by the read-only D1 queries.

export interface ProjectRow {
  id: number;
  slug: string;
  name: string;
}

export interface StoryRow {
  id: number;
  project_id: number;
  title: string;
  story_type: string;
  current_state: string | null;
  priority: string | null;
  estimate: number | null;
  requested_by_id: number | null;
  created_at: string | null;
  accepted_at: string | null;
  deadline: string | null;
  description: string | null;
  url: string | null;
  extra: string | null;
  /** joined from users */
  requested_by: string | null;
}

export interface CommentRow {
  seq: number;
  commented_on: string | null;
  body: string;
  /** joined from users */
  author: string | null;
}

export interface TaskRow {
  seq: number;
  description: string;
  status: string | null;
}

export interface AttachmentRow {
  filename: string;
  size: number | null;
  rel_path: string;
}
